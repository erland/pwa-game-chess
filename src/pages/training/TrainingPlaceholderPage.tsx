interface Props {
  title: string;
  description?: string;
}

export function TrainingPlaceholderPage({ title, description }: Props) {
  return (
    <div className="card">
      <h3>{title}</h3>
      <p className="muted">{description ?? 'Coming soon.'}</p>
    </div>
  );
}
