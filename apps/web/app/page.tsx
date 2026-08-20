export default function Home() {
  return (
    <main style={{ padding: 48, maxWidth: 720, margin: "0 auto" }}>
      <h1>Fillin</h1>
      <p>Forms, without the busywork.</p>
      <p>
        This is the server-side API for the Fillin Chrome extension. It handles
        AI reasoning only. User documents and profiles are never stored here.
      </p>
      <ul>
        <li>
          <code>GET /api/health</code> — service status
        </li>
        <li>
          <code>POST /api/ai/analyze</code> — resolve ambiguous form fields from
          minimal relevant context
        </li>
        <li>
          <code>POST /api/ai/answer</code> — answer a form question from verified
          information
        </li>
        <li>
          <code>POST /api/ai/classify</code> — classify a question
        </li>
        <li>
          <code>POST /api/ai/extract</code> — extract facts from a document text
        </li>
      </ul>
    </main>
  );
}