# Music Player Implementation Plan - "Dustic"
## Internet Archive Streaming Service

---

## 🎯 Project Overview

A Spotify-like music player that streams audio directly from Internet Archive collections. Built with SvelteKit, featuring smart rule-based autoplay and modern streaming UI.

**Core Principle**: No AI, no backend - pure client-side app with **user-controlled data export/import** (no silent persistence).

---

## 📋 Tech Stack

- **Framework**: SvelteKit (static adapter for deployment)
- **Styling**: TailwindCSS + DaisyUI (streaming service aesthetics)
- **State Management**: Svelte stores
- **Data Source**: Internet Archive API (archive.org)
- **Storage**: User-controlled JSON export/import (no silent persistence)
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
│   │   │   ├── Sidebar/
│   │   │   │   ├── Navigation.svelte        # Main nav
│   │   │   │   ├── PlaylistList.svelte      # User playlists
│   │   │   │   ├── RecentlyPlayed.svelte    # History
│   │   │   │   └── ProfileManager.svelte    # Download/upload buttons
│   │   │   └── Settings/
│   │   │       ├── AutoplayRuleEditor.svelte # Rule config UI
│   │   │       └── CollectionFilters.svelte  # Collection preferences
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
│   │   │   └── storage.ts                   # JSON export/import service
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
│   │   ├── history/+page.svelte             # Recently played
│   │   ├── trending/+page.svelte            # Most downloaded (IA metrics)
│   │   └── settings/
│   │       ├── +page.svelte                 # Settings overview
│   │       └── autoplay/+page.svelte        # Autoplay rules editor
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
**ALL Internet Archive audio collections**, including:
- `etree` - Live Music Archive (concerts, live performances)
- `audio_music` - General music collection
- `78rpm` - Historical 78 RPM recordings
- `opensource_audio` - Open source audio
- `librivoxaudio` - Audiobooks
- `radioprograms` - Old time radio
- `audio_podcast` - Podcasts
- `audio_tech` - Technical/educational audio
- And any other collection containing audio formats

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

**USER-CONFIGURABLE RULES** - Users can enable/disable, adjust weights, and reorder priority:

```typescript
interface AutoplayRule {
  id: string
  name: string
  enabled: boolean
  weight: number  // 0-100, relative probability
  strategy: (track: Track) => Promise<Track | null>
}

const DEFAULT_RULES: AutoplayRule[] = [
  { id: 'same-album', name: 'Same Album', enabled: true, weight: 60, strategy: findNextInAlbum },
  { id: 'same-artist', name: 'Same Artist', enabled: true, weight: 30, strategy: findSameArtist },
  { id: 'similar-genre', name: 'Similar Genre', enabled: true, weight: 8, strategy: findSimilarGenre },
  { id: 'same-collection', name: 'Same Collection', enabled: false, weight: 0, strategy: findSameCollection },
  { id: 'same-decade', name: 'Same Decade', enabled: false, weight: 0, strategy: findSameDecade },
  { id: 'random', name: 'Random Discovery', enabled: true, weight: 2, strategy: findRandom }
]

async function getNextTrack(currentTrack: Track, userRules: AutoplayRule[]): Promise<Track> {
  // Use weighted random selection from enabled rules
  const enabledRules = userRules.filter(r => r.enabled && r.weight > 0)
  const totalWeight = enabledRules.reduce((sum, r) => sum + r.weight, 0)

  // Try rules based on weighted probability
  let random = Math.random() * totalWeight
  for (const rule of enabledRules) {
    random -= rule.weight
    if (random <= 0) {
      const track = await rule.strategy(currentTrack)
      if (track) return track
    }
  }

  // Fallback to pure random if all strategies fail
  return findRandom()
}
```

**Settings UI** - Drag-to-reorder, sliders for weights, toggle enable/disable:
```
┌─────────────────────────────────────┐
│ Autoplay Rules (drag to reorder)   │
├─────────────────────────────────────┤
│ ☑ Same Album          [▓▓▓▓▓▓░░] 60%│ ≡
│ ☑ Same Artist         [▓▓▓░░░░░] 30%│ ≡
│ ☑ Similar Genre       [▓░░░░░░░]  8%│ ≡
│ ☐ Same Collection     [░░░░░░░░]  0%│ ≡
│ ☐ Same Decade         [░░░░░░░░]  0%│ ≡
│ ☑ Random Discovery    [░░░░░░░░]  2%│ ≡
├─────────────────────────────────────┤
│ [Save as Preset] [Reset to Default]│
└─────────────────────────────────────┘
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

### 5. Library & User Data Management (`lib/stores/library.ts`)

**User Profile JSON Schema** (exported/imported by user):
```typescript
interface UserProfile {
  version: string               // Schema version for compatibility
  exported: number              // Timestamp
  favorites: string[]           // Track identifiers
  playlists: {
    [id: string]: {
      name: string
      tracks: string[]
      created: number
      updated: number
    }
  }
  history: {
    trackId: string
    playedAt: number
  }[]                           // Last 100
  autoplayRules: AutoplayRule[] // Custom rule configuration
  settings: {
    volume: number
    repeat: 'off' | 'one' | 'all'
    defaultCollection?: string
  }
}
```

**Features:**
- **Download Profile** button → saves `dustic-profile.json`
- **Upload Profile** button → loads from file
- **beforeunload warning** → "You have unsaved changes. Download your profile before leaving?"
- **Dirty state tracking** → Show indicator when changes exist
- Add/remove favorites (marks dirty)
- Create/edit/delete playlists (marks dirty)
- Drag-and-drop reordering
- Recently played tracking
- Auto-expire old history (>100 entries)

**Implementation:**
```typescript
let isDirty = false

function markDirty() {
  isDirty = true
}

window.addEventListener('beforeunload', (e) => {
  if (isDirty) {
    e.preventDefault()
    e.returnValue = 'You have unsaved changes. Download your profile before leaving?'
  }
})

function exportProfile() {
  const profile = { /* build profile */ }
  const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `dustic-profile-${Date.now()}.json`
  a.click()
  isDirty = false
}

function importProfile(file: File) {
  const reader = new FileReader()
  reader.onload = (e) => {
    const profile = JSON.parse(e.target.result)
    // Validate and load profile
    loadProfile(profile)
    isDirty = false
  }
  reader.readAsText(file)
}
```

---

## 🎨 UI/UX Design

### Layout Structure

```
┌─────────────────────────────────────────────────┐
│ [Sidebar]              [Main Content]           │
│                                                  │
│ 🏠 Home                Search: ___________      │
│ 🔍 Search              🔔 Unsaved Changes       │
│ 📚 Library             [Content Area]           │
│ ⚙️  Settings            - Album Grid             │
│                        - Track Lists             │
│ ─────────              - Item Details            │
│ Playlists:                                       │
│ • Favorites            [↓ Download Profile]     │
│ • My Mix               [↑ Upload Profile]       │
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
- [ ] User-configurable rules system
- [ ] Weighted random rule selection
- [ ] Same artist/album detection
- [ ] Genre/tag matching
- [ ] Settings UI (drag-to-reorder, sliders)
- [ ] Rule presets (Focus, Discovery modes)
- [ ] Preloading optimization

### Phase 5: Library Features (Week 5)
- [ ] JSON export/import service
- [ ] Favorites system (marks dirty)
- [ ] Playlist creation/editing (marks dirty)
- [ ] Recently played tracking
- [ ] Profile download/upload UI
- [ ] beforeunload warning implementation
- [ ] Dirty state indicator
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

**Must Have (All Features):**
- ✅ Recently played
- ✅ Browse collections (by most downloaded, recent uploads)
- ✅ Shuffle/repeat modes
- ✅ Drag-and-drop queue reorder
- ✅ Export/import user profile
- ✅ Configurable autoplay rules
- ✅ Unsaved changes warning
- ✅ Trending/popular (using IA download metrics)

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

### Internet Archive Collections
**Search ALL audio collections** - no priority filtering. Users can filter by collection in search UI.

Common collections shown as quick filters:
```typescript
const POPULAR_COLLECTIONS = [
  { id: 'etree', name: 'Live Music Archive', icon: '🎸' },
  { id: 'audio_music', name: 'Music', icon: '🎵' },
  { id: '78rpm', name: '78 RPM', icon: '📻' },
  { id: 'librivoxaudio', name: 'Audiobooks', icon: '📚' },
  { id: 'radioprograms', name: 'Radio Programs', icon: '📡' },
  { id: 'audio_podcast', name: 'Podcasts', icon: '🎙️' }
]
```

### Default Autoplay Rules
```typescript
const DEFAULT_AUTOPLAY_RULES = [
  { id: 'same-album', name: 'Same Album', enabled: true, weight: 60 },
  { id: 'same-artist', name: 'Same Artist', enabled: true, weight: 30 },
  { id: 'similar-genre', name: 'Similar Genre', enabled: true, weight: 8 },
  { id: 'same-collection', name: 'Same Collection', enabled: false, weight: 0 },
  { id: 'same-decade', name: 'Same Decade', enabled: false, weight: 0 },
  { id: 'random', name: 'Random Discovery', enabled: true, weight: 2 }
]

const CONFIG = {
  maxHistorySize: 100,
  maxQueueSize: 500,
  profileVersion: '1.0.0'
}
```

---

## 🧪 Testing Strategy

**Manual Testing:**
- Search various queries (music, audiobooks, podcasts)
- Search ALL collections vs. filtered
- Play full albums
- Test autoplay with different rule configurations
- Queue manipulation
- Profile export/import
- beforeunload warning (close tab with changes)
- Mobile responsiveness
- Trending/popular pages (IA download metrics)

**Edge Cases:**
- No search results
- Failed audio load
- Network offline
- Empty queue autoplay
- Corrupt metadata
- Very long track names
- Corrupt profile JSON on import
- Profile with missing fields (old version)
- Unsaved changes on page close

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

**User Profile Management:**
- NO silent localStorage - user explicitly downloads profile JSON
- Profile includes: favorites, playlists, history, autoplay rules, settings
- Warn on page close if unsaved changes exist
- Show dirty state indicator in UI
- Profile versioning for future compatibility
- Old history auto-expired at 100 entries to keep file size reasonable

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
