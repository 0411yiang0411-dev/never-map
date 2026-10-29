export function retryPolicy(status = 0, failures = 0) {
  if (status === 401 || status === 403) return { kind: 'auth', delay: Infinity };
  if (status === 409) return { kind: 'conflict', delay: Infinity };
  if ([400, 413, 415].includes(status)) return { kind: 'content', delay: Infinity };
  if (status === 429) return { kind: 'quota', delay: 60000 };
  return { kind: 'network', delay: Math.min(60000, 5000 * 2 ** Math.min(failures, 4)) };
}
export function resumeDecision({ pending, revision, localSignature, lastUploadSignature }, remoteRevision, remoteSignature) {
  if (!pending) return 'download';
  if (localSignature === remoteSignature) return 'acknowledged';
  if (revision === remoteRevision) return 'upload';
  if (revision !== null && remoteRevision === revision + 1 && lastUploadSignature === remoteSignature) return 'acknowledged-upload-again';
  return 'conflict';
}
