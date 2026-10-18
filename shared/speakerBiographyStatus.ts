/** Shared status contract: an empty biography can never be reported as complete. */
export type SpeakerBiographyStatus =
  | 'pending'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'waiting_sources'
  | 'missing_summary'
  | 'review_required';

export function resolveSpeakerBiographyStatus(status: unknown, hasBiography: boolean): SpeakerBiographyStatus {
  if (status === 'ready') return hasBiography ? 'ready' : 'missing_summary';
  if (status === 'processing' || status === 'failed' || status === 'waiting_sources' || status === 'review_required') return status;
  return 'pending';
}

export function speakerBiographyStatusLabel(status: SpeakerBiographyStatus): string {
  switch (status) {
    case 'ready': return '摘要已完成';
    case 'processing': return '正在產生摘要';
    case 'failed': return '摘要異常';
    case 'waiting_sources': return '尚無可用的公開逐字稿';
    case 'missing_summary': return '摘要內容缺失';
    case 'review_required': return '多人故事待人工核對';
    default: return '等待產生摘要';
  }
}
