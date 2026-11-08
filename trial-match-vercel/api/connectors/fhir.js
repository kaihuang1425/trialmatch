// POST /api/connectors/fhir { patientId }  ->  facts read from the connected FHIR R4 server (read-only), each with its source line.
import { clientIp, readJson, route, send } from '../../lib/http.js';
import { rateLimit } from '../../lib/redis.js';
import { readFhirPatient } from '../../lib/fhir.js';

export default route(['POST'], async (req, res) => {
  const body = await readJson(req, 4 * 1024);
  await rateLimit('fhir:' + clientIp(req), 30, 600);
  const out = await readFhirPatient(body.patientId);
  send(res, 200, out);
});
