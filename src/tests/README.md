# Dustic Test Suite

Automated tests for critical functionality to catch bugs early.

## Running Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode (re-runs on file changes)
npm run test:watch

# Run tests with UI (browser-based test viewer)
npm run test:ui

# Run tests with coverage report
npm run test:coverage
```

## Test Files

### Player Store Tests (`player.test.ts`)
Tests the core audio playback functionality:

**Critical Functionality:**
- ✅ Audio element must be set before playing (prevents silent failures)
- ✅ Playing a track updates state and starts playback
- ✅ Play/pause toggles work correctly
- ✅ Volume control maintains valid range (0-1)
- ✅ Seek operations work correctly
- ✅ Repeat mode cycles through off → all → one → off

**State Invariants:**
- ✅ Volume always stays between 0 and 1
- ✅ Seek handles negative times gracefully

**Edge Cases:**
- ✅ Audio errors don't crash the app
- ✅ Rapid play/pause toggles are handled

### Queue Store Tests (`queue.test.ts`)
Tests queue management and navigation:

**Basic Operations:**
- ✅ Queue starts empty
- ✅ Setting queue with tracks and index
- ✅ Adding tracks to end of queue
- ✅ Removing tracks by index
- ✅ Clearing entire queue

**Navigation:**
- ✅ Getting next/previous tracks
- ✅ Returns null when no next/previous available
- ✅ Playing track at specific index

**State Invariants:**
- ✅ currentIndex never exceeds track count
- ✅ Queue integrity maintained when removing current track
- ✅ Shuffle preserves all tracks but reorders them

**Edge Cases:**
- ✅ Empty queue operations don't crash
- ✅ Invalid index handling
- ✅ Removing all tracks sequentially

## What These Tests Catch

### Real Bugs Prevented:
1. **PlayerBar not mounted** - Critical bug where clicking play did nothing
   - Test: "should play a track when audio element is mounted"
   - Catches when audio element doesn't exist in DOM

2. **State corruption** - Queue operations leaving invalid state
   - Tests: State Invariants section
   - Catches index out of bounds, null references

3. **Volume bugs** - Invalid volume values crashing playback
   - Test: "should keep volume in valid range"
   - Catches clamping issues

### Testing Strategies Used:

1. **Unit Testing** - Individual store functions tested in isolation
2. **State Invariant Testing** - Properties that must always be true
3. **Edge Case Testing** - Boundary conditions and error states
4. **Property-Based Concepts** - Volume must be 0-1, index must be valid

## Future Test Additions

Recommended tests to add:

1. **Component Tests** - Test Svelte components with user interactions
2. **Integration Tests** - Test player + queue + history working together
3. **E2E Tests** - Full user flows (search → play → favorite)
4. **Offline Tests** - Downloaded tracks work without network
5. **Error Recovery** - Network failures, API errors, corrupt data

## Writing New Tests

### Example Test Structure:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { yourStore } from '$lib/stores/yourStore';

describe('Your Feature', () => {
  beforeEach(() => {
    // Reset state before each test
  });

  describe('Happy Path', () => {
    it('should work in normal conditions', () => {
      // Arrange: Set up test data
      // Act: Call the function
      // Assert: Check the result
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty input', () => {
      // Test boundary conditions
    });
  });
});
```

### Test Guidelines:

1. **Arrange-Act-Assert** - Clear test structure
2. **One assertion per test** - Tests should be focused
3. **Descriptive names** - Test name explains what's being tested
4. **Independent tests** - Tests don't depend on each other
5. **Fast execution** - Mock external dependencies

## CI/CD Integration

To run tests in GitHub Actions, add to `.github/workflows/test.yml`:

```yaml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm test
```

## Debugging Tests

```bash
# Run specific test file
npm test player.test.ts

# Run tests matching pattern
npm test -- --grep "should play"

# Run with verbose output
npm test -- --reporter=verbose

# Debug in VS Code
# Add breakpoint, then run "Debug Vitest" from command palette
```
