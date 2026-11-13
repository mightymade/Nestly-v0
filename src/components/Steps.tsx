/** One-line progress for sign-up flows: thin bars and "Step 2 of 4 · Identity". */
export function Steps({ steps, at }: { steps: string[]; at: number }) {
  return <div className="steps" role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={at} aria-label={`Step ${at} of ${steps.length}: ${steps[at - 1]}`}>
    <div className="steps-bars">{steps.map((s, i) => <i key={s} className={i < at ? 'on' : ''} />)}</div>
    <span className="steps-text">Step {at} of {steps.length} · <b>{steps[at - 1]}</b></span>
  </div>;
}
