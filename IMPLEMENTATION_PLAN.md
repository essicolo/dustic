# Music Player Implementation Plan - "Dustic"
## Internet Archive Streaming Service

---

## 🎯 Project Overview

A Spotify-like music player that streams audio directly from Internet Archive collections. Built with SvelteKit, featuring smart rule-based autoplay and modern streaming UI.

**Core Principle**: No AI, no backend - pure client-side app with localStorage persistence.

---

## 📋 Tech Stack

- **Framework**: SvelteKit (static adapter for deployment)
- **Styling**: TailwindCSS + DaisyUI (streaming service aesthetics)
- **State Management**: Svelte stores
- **Data Source**: Internet Archive API (archive.org)
- **Storage**: Browser localStorage
- **Audio**: HTML5 Audio API
- **Deployment**: Vercel/Netlify (static)

---

## 🏗️ Architecture

```
dustic/
├── src/
│   ├── lib/
│   │   ├── components/
│   │   │   ├── Player/
│   │   │   │   ├── PlayerBar.svelte         # Bottom player controls
│   │   │   │   ├── PlayerControls.svelte    # Play/pause/skip/volume
│   │   │   │   ├── ProgressBar.svelte       # Seek bar
│   │   │   │   └── NowPlaying.svelte        # Current track info
│   │   │   ├── Search/
│   │   │   │   ├── SearchBar.svelte         # Main search input
│   │   │   │   ├── SearchResults.svelte     # Results display
│   │   │   │   └── FilterPanel.svelte       # Collection/format filters
│   │   │   ├── Browse/
│   │   │   │   ├── CollectionGrid.svelte    # Featured collections
│   │   │   │   ├── TrackList.svelte         # List of tracks
│   │   │   │   └── AlbumCard.svelte         # Album/item card
│   │   │   ├── Queue/
│   │   │   │   ├── QueuePanel.svelte        # Upcoming tracks
│   │   │   │   └── QueueItem.svelte         # Single queue entry
│   │   │   └── Sidebar/
│   │   │       ├── Navigation.svelte        # Main nav
│   │   │       ├── PlaylistList.svelte      # User playlists
│   │   │       └── RecentlyPlayed.svelte    # History
│   │   ├── stores/
│   │   │   ├── player.ts                    # Player state & controls
│   │   │   ├── queue.ts                     # Queue management
│   │   │   ├── library.ts                   # Favorites, playlists
│   │   │   ├── history.ts                   # Recently played
│   │   │   └── search.ts                    # Search state
│   │   ├── services/
│   │   │   ├── internetArchive.ts           # API client
│   │   │   ├── autoplay.ts                  # Smart next track logic
│   │   │   ├── metadata.ts                  # Metadata parsing
│   │   │   └── storage.ts                   # localStorage wrapper
│   │   └── utils/
│   │       ├── formatTime.ts                # Duration formatting
│   │       ├── parseMetadata.ts             # IA metadata normalization
│   │       └── constants.ts                 # IA collections, API endpoints
│   ├── routes/
│   │   ├── +layout.svelte                   # App shell (sidebar + player)
│   │   ├── +page.svelte                     # Home/discover
│   │   ├── search/
│   │   │   └── +page.svelte                 # Search results page
│   │   ├── collection/
│   │   │   └── [id]/+page.svelte            # Collection detail
│   │   ├── item/
│   │   │   └── [id]/+page.svelte            # Album/item detail
│   │   ├── library/
│   │   │   ├── +page.svelte                 # Library overview
│   │   │   ├── favorites/+page.svelte       # Liked tracks
│   │   │   └── playlists/
│   │   │       └── [id]/+page.svelte        # Playlist detail
│   │   └── history/+page.svelte             # Recently played
│   └── app.html                             # HTML template
├── static/
│   └── favicon.png
├── svelte.config.js
├── tailwind.config.js
├── vite.config.ts
├── package.json
└── tsconfig.json
```

---

## 🔌 Internet Archive API Integration

### Key Endpoints

```typescript
// Search
GET https://archive.org/advancedsearch.php
  ?q=collection:(etree) AND format:(mp3 OR ogg)
  &fl[]=identifier,title,creator,date,format
  &rows=50&output=json

// Item Metadata
GET https://archive.org/metadata/{identifier}

// Stream URL
https://archive.org/download/{identifier}/{filename}
```

### Target Collections
- `etree` - Live Music Archive (concerts, live performances)
- `audio_music` - General music collection
- `78rpm` - Historical 78 RPM recordings
- `opensource_audio` - Open source audio

### Metadata Fields
- `identifier` - Unique ID
- `title` - Track/album title
- `creator` - Artist name
- `date` - Release/recording date
- `subject` - Genre tags
- `description` - Additional info
- `format` - File formats available
- `collection` - Source collection

---

## 🎵 Core Features & Implementation

### 1. Audio Playback Engine (`lib/stores/player.ts`)

```typescript
interface PlayerState {
  currentTrack: Track | null
  isPlaying: boolean
  volume: number
  currentTime: number
  duration: number
  repeat: 'off' | 'one' | 'all'
  shuffle: boolean
}

// Core methods:
- play(track: Track)
- pause()
- resume()
- next()
- previous()
- seek(time: number)
- setVolume(level: number)
```

**Implementation Notes:**
- Use HTML5 Audio element wrapped in Svelte store
- Preload next track for gapless playback
- Handle stream errors gracefully (fallback formats)
- Track playback events for history

### 2. Smart Autoplay Rules (`lib/services/autoplay.ts`)

**Rule Hierarchy** (when queue is empty):

1. **Same Album** - Next track from current album
2. **Same Artist** - Random track by same artist
3. **Same Collection** - Random from same IA collection
4. **Similar Genre** - Match subject tags
5. **Same Decade** - Match date ranges
6. **Random Discovery** - Random popular track

```typescript
async function getNextTrack(currentTrack: Track): Promise<Track> {
  // Try rules in order, return first match
  const strategies = [
    findNextInAlbum,
    findSameArtist,
    findSameCollection,
    findSimilarGenre,
    findSameDecade,
    findRandom
  ]

  for (const strategy of strategies) {
    const track = await strategy(currentTrack)
    if (track) return track
  }
}
```

### 3. Queue Management (`lib/stores/queue.ts`)

```typescript
interface QueueState {
  current: number
  tracks: Track[]
  original: Track[] // For shuffle mode
  history: Track[]
}

// Methods:
- addNext(track: Track)
- addToEnd(tracks: Track[])
- remove(index: number)
- reorder(from: number, to: number)
- clear()
- enableShuffle()
- disableShuffle()
```

**Shuffle Logic:**
- Store original order
- Fisher-Yates shuffle
- Keep current track at position 0
- Disable preserves position in original queue

### 4. Search (`lib/services/internetArchive.ts`)

```typescript
interface SearchParams {
  query: string
  collection?: string[]
  format?: string[]
  sort?: 'relevance' | 'date' | 'downloads'
  page?: number
  pageSize?: number
}

async function search(params: SearchParams): Promise<SearchResult>
async function getItem(identifier: string): Promise<Item>
async function getStreamUrl(identifier: string, filename: string): Promise<string>
```

**Search Features:**
- Full-text search across metadata
- Filter by collection, format, date
- Sort by relevance, popularity, date
- Pagination (50 results per page)
- Debounced input (300ms)

### 5. Library & Persistence (`lib/stores/library.ts`)

**LocalStorage Schema:**
```typescript
{
  favorites: string[]              // Track identifiers
  playlists: {
    [id: string]: {
      name: string
      tracks: string[]
      created: timestamp
      updated: timestamp
    }
  }
  history: {
    trackId: string
    playedAt: timestamp
  }[]  // Max 100 entries
}
```

**Features:**
- Add/remove favorites
- Create/edit/delete playlists
- Drag-and-drop reordering
- Recently played (last 100)
- Export/import as JSON

---

## 🎨 UI/UX Design

### Layout Structure

```
┌─────────────────────────────────────────────────┐
│ [Sidebar]              [Main Content]           │
│                                                  │
│ 🏠 Home                Search: ___________      │
│ 🔍 Search                                        │
│ 📚 Library             [Content Area]           │
│                        - Album Grid              │
│ ─────────              - Track Lists             │
│ Playlists:             - Item Details            │
│ • Favorites                                      │
│ • My Mix                                         │
│                                                  │
├─────────────────────────────────────────────────┤
│ [Now Playing Bar - Fixed Bottom]                │
│ [Album Art] Title - Artist                      │
│             ⏮ ⏯ ⏭  ═══●═══ 2:34/4:12  🔊 ≡     │
└─────────────────────────────────────────────────┘
```

### Color Scheme (Dark Mode First)
- **Primary**: Indigo/Purple gradient (streaming vibe)
- **Background**: Dark gray (#0F172A)
- **Surface**: Lighter gray (#1E293B)
- **Accent**: Bright purple (#A855F7)
- **Text**: White/gray scale

### Key UI Components

**PlayerBar** (sticky bottom)
- Album art thumbnail (64x64)
- Track title + artist (clickable)
- Controls: prev, play/pause, next
- Progress bar with time
- Volume slider
- Queue toggle

**SearchResults**
- Grid view for albums/items
- List view for tracks
- Infinite scroll
- Filter chips (collection, format)

**TrackList**
- Hover actions (play, add to queue, favorite)
- Drag handle for reordering
- Context menu (add to playlist, etc.)
- Playing indicator (animated bars)

---

## 🚀 Implementation Phases

### Phase 1: Foundation (Week 1)
- [ ] SvelteKit project setup with TypeScript
- [ ] TailwindCSS + DaisyUI configuration
- [ ] Basic routing structure
- [ ] Internet Archive API service
- [ ] Player store with basic controls
- [ ] Simple audio playback test

### Phase 2: Core Player (Week 2)
- [ ] PlayerBar component (full controls)
- [ ] Queue management store
- [ ] Progress bar with seek
- [ ] Volume control
- [ ] Repeat/shuffle modes
- [ ] Keyboard shortcuts (space, arrows)

### Phase 3: Search & Browse (Week 3)
- [ ] Search page with filters
- [ ] Search results display (grid + list)
- [ ] Item detail page (album view)
- [ ] Collection browse page
- [ ] Home page (featured collections)
- [ ] Metadata parsing utilities

### Phase 4: Smart Autoplay (Week 4)
- [ ] Autoplay service implementation
- [ ] Rule-based next track logic
- [ ] Same artist/album detection
- [ ] Genre/tag matching
- [ ] Fallback to random
- [ ] Preloading optimization

### Phase 5: Library Features (Week 5)
- [ ] LocalStorage service
- [ ] Favorites system
- [ ] Playlist creation/editing
- [ ] Recently played tracking
- [ ] Library page UI
- [ ] Drag-and-drop reordering

### Phase 6: Polish & Optimization (Week 6)
- [ ] Loading states & skeletons
- [ ] Error handling & retry logic
- [ ] Offline detection
- [ ] Performance optimization
- [ ] Accessibility (ARIA labels, keyboard nav)
- [ ] Mobile responsive design
- [ ] PWA manifest

### Phase 7: Deploy & Test
- [ ] Static build configuration
- [ ] Vercel/Netlify deployment
- [ ] Cross-browser testing
- [ ] Mobile testing
- [ ] Performance audit
- [ ] Documentation

---

## 🎯 MVP Feature Set

**Must Have:**
- ✅ Search tracks/albums/artists
- ✅ Play/pause/skip controls
- ✅ Queue management
- ✅ Smart autoplay (rule-based)
- ✅ Favorites
- ✅ Volume & seek controls
- ✅ Basic playlists

**Nice to Have:**
- 📋 Recently played
- 📋 Browse collections
- 📋 Shuffle/repeat modes
- 📋 Drag-and-drop queue reorder
- 📋 Export/import library

**Future Enhancements:**
- 🔮 Lyrics display (if available in metadata)
- 🔮 Visualizer
- 🔮 Social sharing
- 🔮 Collaborative playlists
- 🔮 Crossfade between tracks
- 🔮 Equalizer
- 🔮 Sleep timer
- 🔮 Desktop app (Tauri)

---

## ⚠️ Challenges & Solutions

### Challenge 1: Rate Limiting
**Problem**: Internet Archive may rate limit API requests
**Solution**:
- Cache search results in memory (5 min TTL)
- Debounce search input
- Implement exponential backoff on errors
- Show cached results when offline

### Challenge 2: Metadata Inconsistency
**Problem**: IA metadata quality varies wildly
**Solution**:
- Normalize metadata fields (title casing, trim)
- Fallback values (Unknown Artist, Untitled)
- Extract metadata from filenames when missing
- Manual corrections stored in localStorage

### Challenge 3: Audio Format Compatibility
**Problem**: Not all formats play in all browsers
**Solution**:
- Prefer MP3 > OGG > FLAC
- Detect browser support (`HTMLAudioElement.canPlayType()`)
- Fallback chain for each track
- Show format badges in UI

### Challenge 4: Large Files / Slow Streams
**Problem**: Some IA files are huge, slow to buffer
**Solution**:
- Show buffering indicator
- Timeout on stalled downloads (30s)
- Skip to next track on repeated failures
- Prefer lower bitrate when available

### Challenge 5: No Track Duration Metadata
**Problem**: IA doesn't always provide duration
**Solution**:
- Load audio to get duration (onloadedmetadata)
- Cache durations in localStorage
- Show "Loading..." until known
- Estimate from file size (rough)

---

## 📊 Data Models

### Track
```typescript
interface Track {
  identifier: string        // IA identifier
  filename: string          // Audio file
  title: string
  artist: string
  album?: string
  date?: string
  duration?: number         // seconds
  collection: string[]
  genre?: string[]          // from subject tags
  format: string            // mp3, ogg, etc.
  streamUrl: string
  thumbnailUrl?: string
  metadata: object          // raw IA metadata
}
```

### Playlist
```typescript
interface Playlist {
  id: string                // uuid
  name: string
  description?: string
  tracks: string[]          // Track identifiers
  created: number           // timestamp
  updated: number
  thumbnail?: string        // First track's art
}
```

### HistoryEntry
```typescript
interface HistoryEntry {
  trackId: string
  playedAt: number          // timestamp
  completionRate: number    // 0-1 (did they finish it?)
}
```

---

## 🔧 Configuration

### Internet Archive Collections Priority
```typescript
const COLLECTIONS = [
  { id: 'etree', name: 'Live Music Archive', priority: 1 },
  { id: 'audio_music', name: 'Music Collection', priority: 2 },
  { id: '78rpm', name: '78 RPM Recordings', priority: 3 },
  { id: 'opensource_audio', name: 'Open Audio', priority: 4 }
]
```

### Autoplay Rules Configuration
```typescript
const AUTOPLAY_CONFIG = {
  sameAlbumWeight: 0.6,      // 60% chance to stay in album
  sameArtistWeight: 0.3,     // 30% chance same artist
  similarGenreWeight: 0.08,  // 8% similar genre
  randomWeight: 0.02,        // 2% random discovery
  maxHistorySize: 100,
  maxQueueSize: 500
}
```

---

## 🧪 Testing Strategy

**Manual Testing:**
- Search various queries
- Play full albums
- Test autoplay transitions
- Queue manipulation
- LocalStorage persistence
- Mobile responsiveness

**Edge Cases:**
- No search results
- Failed audio load
- Network offline
- Empty queue autoplay
- Corrupt metadata
- Very long track names

**Performance:**
- Lighthouse audit (target: 90+)
- Search response time (<1s)
- Audio start time (<2s)
- Memory leaks (play 50+ tracks)

---

## 📝 Development Notes

**Svelte Gotchas:**
- Audio element must be in DOM for iOS playback
- Use `bind:this` for audio element reference
- Stores update async - use `$` prefix in templates
- Avoid memory leaks - unsubscribe in `onDestroy`

**Internet Archive Quirks:**
- Some items have 100+ audio files (needs filtering)
- Metadata can be deeply nested or flat
- Date formats inconsistent (YYYY, YYYY-MM-DD, etc.)
- Creator field sometimes missing or in description
- Collection field is array, can be in multiple

**LocalStorage Limits:**
- ~5-10MB total (varies by browser)
- Store only IDs, not full track objects
- Compress if needed (JSON.stringify → LZ-string)
- Clear old history entries periodically

---

## 🎓 Resources

- **Internet Archive API**: https://archive.org/help/aboutsearch.htm
- **SvelteKit Docs**: https://kit.svelte.dev/docs
- **TailwindCSS**: https://tailwindcss.com/docs
- **DaisyUI Components**: https://daisyui.com/components/
- **HTML5 Audio**: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/audio

---

## ✅ Success Criteria

- [x] Plays music from Internet Archive
- [x] Search works reliably
- [x] Queue management functional
- [x] Autoplay transitions smoothly
- [x] UI feels like modern streaming service
- [x] Works on mobile
- [x] No backend required
- [x] Loads in <3 seconds
- [x] Accessible (keyboard nav, screen readers)

---

**Estimated Timeline**: 6-8 weeks for full MVP
**Complexity**: Medium - Doable for intermediate Svelte developer
**Deployment Cost**: $0 (static hosting on Vercel/Netlify free tier)

**This is 100% feasible without AI!** The rule-based autoplay is clever enough to feel smart, and Internet Archive has amazing content. Ready to build? 🚀
