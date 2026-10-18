/**
 * One canonical Starry ID membership filter shared by the directory, its
 * select-all snapshot endpoint, and the audited bulk access preview.
 *
 * Only approved titles are included in rank filters. SQL values are bound,
 * never interpolated from client input.
 */
export const APPROVED_MEMBER_RANK_SQL = "CASE WHEN p.rankApproved=1 THEN TRIM(COALESCE(p.approvedRank,'')) ELSE '' END";

export type MemberDirectoryFilter = {
  conditions: string[];
  params: string[];
  where: string;
};

export function memberDirectoryFilter(search: string, rank: string): MemberDirectoryFilter {
  const q = String(search || '').trim().slice(0, 80);
  const selectedRank = String(rank || '').trim().slice(0, 100);
  const conditions: string[] = [];
  const params: string[] = [];

  if (q) {
    const like = '%' + q + '%';
    conditions.push("(LOWER(COALESCE(p.name,'')) LIKE LOWER(?) OR LOWER(u.primaryEmail) LIKE LOWER(?) OR LOWER(COALESCE(p.amwayId,'')) LIKE LOWER(?))");
    params.push(like, like, like);
  }
  if (selectedRank) {
    conditions.push(APPROVED_MEMBER_RANK_SQL + '=?');
    params.push(selectedRank === '__unapproved__' ? '' : selectedRank);
  }
  return {conditions, params, where: conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''};
}
