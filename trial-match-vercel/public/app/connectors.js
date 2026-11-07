/* Trial Match connectors, browser side. Talks to /api/* on the same site.
 * Every connector is optional: when one is not set up on the server, the app keeps its on-device fallback.
 *   TMConnect.ready            -> Promise of the status from /api/status
 *   TMConnect.status()         -> { medgemma, store, fhir, registry } (each has .on)
 *   TMConnect.readLetter(text) -> MedGemma Records Reader, facts with quotes
 *   TMConnect.readFhir(id)     -> FHIR record, facts with source lines
 *   TMConnect.scout()          -> live trials from ClinicalTrials.gov
 *   TMConnect.prescreen(nct, record, age, sex) -> MedGemma pre-check of a live trial
 * It also provides window.claude.use('db') (a shared store backed by /api/store) when the page is not running
 * inside a Claude artifact, so the app's existing shared-data code works unchanged.
 */
(function () {
  'use strict';
  var OFF = { medgemma: { on: false }, store: { on: false }, fhir: { on: false }, registry: { on: false } };
  var status = OFF;
  var hasApi = /^https?:$/.test(location.protocol);

  function api(path, body, method) {
    return fetch(path, {
      method: method || (body ? 'POST' : 'GET'),
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store'
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.ok) return j;
        var e = new Error(j.message || ('The service answered ' + r.status + '.'));
        e.code = j.error || ('http_' + r.status); e.status = r.status;
        throw e;
      });
    }, function () {
      var e = new Error('Could not reach the server.'); e.code = 'unavailable'; throw e;
    });
  }

  var ready = hasApi
    ? api('/api/status').then(function (s) { status = s || OFF; return status; }, function () { return status; })
    : Promise.resolve(status);

  window.TMConnect = {
    ready: ready,
    status: function () { return status; },
    readLetter: function (text) { return api('/api/agents/records-reader', { text: text }); },
    readFhir: function (patientId) { return api('/api/connectors/fhir', { patientId: patientId }); },
    scout: function () { return api('/api/agents/trial-scout'); },
    prescreen: function (nct, record, age, sex) { return api('/api/agents/prescreen', { nct: nct, record: record, age: age, sex: sex }); }
  };

  /* ---------- shared store: same shape as the app's shared database, polling /api/store ---------- */
  var COLS = ['patients', 'apps', 'events', 'rankings'];
  function makeDb(first) {
    var v = first.v, data = first.data, listeners = {}, errs = {}, inflight = 0, acked = 0, fails = 0, timer = null, stopped = false;
    function snap(c) {
      var m = data[c] || {};
      return { docs: Object.keys(m).map(function (id) { return { id: id, data: function () { return m[id]; } }; }), metadata: { fromCache: false } };
    }
    function emit(c) { (listeners[c] || []).forEach(function (fn) { try { fn(snap(c)); } catch (e) { console.error(e); } }); }
    function schedule(ms) {
      if (stopped || timer) return;
      timer = setTimeout(poll, ms != null ? ms : (document.hidden ? 15000 : 2500));
    }
    function poll() {
      timer = null;
      if (stopped) return;
      api('/api/store?v=' + encodeURIComponent(v)).then(function (s) {
        fails = 0;
        // Skip a snapshot taken while this viewer's own changes are still saving, or one older than them.
        if (!s.same && inflight === 0 && Number(s.v) >= acked) { v = s.v; data = s.data; COLS.forEach(emit); }
      }, function () {
        if (++fails >= 4) {
          stopped = true;
          Object.keys(errs).forEach(function (c) { errs[c].forEach(function (fn) { fn(new Error('unavailable')); }); });
        }
      }).then(function () { schedule(); });
    }
    function write(body) {
      inflight++;
      return api('/api/store', body).then(function (j) {
        acked = Math.max(acked, Number(j.v) || 0);
        return j;
      }, function (e) {
        e.code = e.code === 'quota_exceeded' ? 'quota_exceeded' : e.status === 429 ? 'resource_exhausted' : (!e.status || e.status >= 500) ? 'unavailable' : 'permission_denied';
        throw e;
      }).finally(function () {
        inflight--;
        if (inflight === 0) { clearTimeout(timer); timer = null; schedule(300); }
      });
    }
    document.addEventListener('visibilitychange', function () { if (!document.hidden && timer) { clearTimeout(timer); timer = null; schedule(0); } });
    schedule();
    return {
      collection: function (c) {
        return {
          onSnapshot: function (fn, onErr) {
            (listeners[c] = listeners[c] || []).push(fn);
            if (onErr) (errs[c] = errs[c] || []).push(onErr);
            setTimeout(function () { fn(snap(c)); }, 0);
            return function () { listeners[c] = (listeners[c] || []).filter(function (x) { return x !== fn; }); };
          },
          doc: function (id) {
            return {
              set: function (doc) { return write({ op: 'set', c: c, id: id, doc: doc }); },
              delete: function () { return write({ op: 'del', c: c, id: id }); }
            };
          }
        };
      },
      // One request instead of hundreds when the demo data is reset.
      replaceAll: function (all) { return write({ op: 'replace', data: all }); }
    };
  }

  if (!window.claude && hasApi) {
    window.claude = {
      use: function (name) {
        if (name !== 'db') return Promise.resolve(null);
        return ready.then(function (s) {
          if (!s.store || !s.store.on) return null;
          return api('/api/store').then(makeDb, function () { return null; });
        });
      }
    };
  }
})();
