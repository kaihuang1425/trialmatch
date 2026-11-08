export default function Home() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 32 }}>
      <h1>Relay — UI coming</h1>
      <p>
        Engine API: <code>GET /api/agent?patientId=SYN-0417</code> and <code>POST /api/agent</code> (NDJSON event stream). Synthetic data only.
      </p>
    </main>
  );
}
