// Point unique de remontée des erreurs inattendues. Aucune erreur ne doit être avalée en silence :
// elle est journalisée ici et, si un service de suivi est configuré (voir lib/monitoring.ts), envoyée.
type Sink = (error: unknown, context?: Record<string, unknown>) => void;
let sink: Sink | null = null;

export function setErrorSink(next: Sink | null) {
  sink = next;
}

export function reportError(error: unknown, context?: Record<string, unknown>) {
  console.error('[das]', error, context ?? '');
  if (!sink) return;
  try {
    sink(error, context);
  } catch (sinkError) {
    console.error('[das] échec de la remontée de l\'erreur', sinkError);
  }
}
