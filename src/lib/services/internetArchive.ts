// Internet Archive API client.
//
// Kept as the public entry point so every existing import keeps working; the
// implementation lives in ./ia, split by what each part actually does:
//
//   ia/query.ts   query building, field lists, URL construction
//   ia/search.ts  advancedsearch and the strategy cascade
//   ia/tracks.ts  item metadata, audio file selection, track building

export * from './ia/query';
export * from './ia/search';
export * from './ia/tracks';
