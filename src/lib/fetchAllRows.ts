// Supabase/PostgREST caps any unpaginated response at 1000 rows — any query against a table that
// can grow past that silently loses everything past the first page. This walks .range() until a
// page comes back short, so every row is always fetched regardless of how large the table grows.
export async function fetchAllRows(build: (from: number, to: number) => any): Promise<any[]> {
  const pageSize = 1000
  let from = 0
  let all: any[] = []
  while (true) {
    const { data } = await build(from, from + pageSize - 1)
    all = all.concat(data ?? [])
    if (!data || data.length < pageSize) break
    from += pageSize
  }
  return all
}
