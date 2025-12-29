export function EndgamesIntroCard(props: {
  availableCount: number;
  startDisabled: boolean;
  onStartNext: () => void;
}) {
  const { availableCount, startDisabled, onStartNext } = props;

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Endgames</h3>
      <p className="muted">Goal-based endgame practice. Select an endgame or start one automatically.</p>
      <div className="actions">
        <button type="button" className="btn btn-primary" onClick={onStartNext} disabled={startDisabled}>
          Start endgame
        </button>
      </div>
      <p className="muted" style={{ marginTop: 8 }}>
        Available endgames: <strong>{availableCount}</strong>
      </p>
    </div>
  );
}
