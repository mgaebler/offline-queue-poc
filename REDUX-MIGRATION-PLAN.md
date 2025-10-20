# Redux Migration Plan - Offline Queue

## Übersicht

Migration der bestehenden Offline-Queue-Implementierung von direktem IndexedDB-Zugriff zu Redux Toolkit mit IndexedDB als Persistenz-Layer.

---

## Architektur-Entscheidung

### Redux als Source of Truth für UI-State

```
┌─────────────────────────────────────────┐
│           Redux Store (Memory)          │
│  - Queue Items (Metadaten + imageIds)  │
│  - Status, Loading, Error               │
│  - KEINE Blobs im State!                │
└─────────────────┬───────────────────────┘
                  │
                  │ Bidirektionale Sync
                  │
┌─────────────────▼───────────────────────┐
│         IndexedDB (Persistent)          │
│  Store 1: formQueue (Metadaten)        │
│  Store 2: queueImages (Blobs)          │
└─────────────────────────────────────────┘
```

### Warum diese Architektur?

✅ **Redux bleibt serializable** (keine Blobs)  
✅ **Konsistent** mit bestehender App-Architektur  
✅ **Performant** (kleine State-Größe im Memory)  
✅ **On-Demand Loading** von Bildern aus IndexedDB  
✅ **Klare Separation**: Redux = UI State, IndexedDB = Blob Storage  

---

## Datenstruktur

### Redux State Schema

```typescript
// store/queueSlice.ts
interface QueueState {
  items: QueueItem[];
  loading: boolean;
  error: string | null;
  processingItemId: string | null;
}

interface QueueItem {
  id: string;
  timestamp: number;
  status: 'pending' | 'sending' | 'sent' | 'error';
  retryCount: number;
  data: FormData;        // Text-Daten
  imageIds: string[];    // ⚠️ Nur Referenzen zu Blobs!
  error?: string;
}

type FormData = {
  field1: string;
  field2: string;
  // ... weitere Textfelder
};
```

### IndexedDB Schema (erweitert)

```typescript
// services/IndexedDBManager.ts
interface QueueDB extends DBSchema {
  // Store 1: Queue-Metadaten (ohne Blobs)
  formQueue: {
    key: string;  // id
    value: {
      id: string;
      timestamp: number;
      status: 'pending' | 'sending' | 'sent' | 'error';
      retryCount: number;
      data: FormData;
      imageIds: string[];  // Referenzen zu queueImages
      error?: string;
    };
    indexes: {
      'by-status': string;
      'by-timestamp': number;
    };
  };
  
  // Store 2: Bilder (Blobs) - NEU!
  queueImages: {
    key: string;  // imageId (UUID)
    value: {
      imageId: string;
      blob: Blob;
      fileName: string;
      mimeType: string;
      uploadedAt: number;
    };
  };
}
```

---

## Implementierungs-Plan

### Phase 1: Setup & Dependencies

**Tasks:**
- [ ] Redux Toolkit installieren
  ```bash
  pnpm add @reduxjs/toolkit react-redux
  ```
- [ ] Store-Struktur erstellen
- [ ] Redux DevTools konfigurieren

**Dateien:**
```
src/
  store/
    store.ts              # NEU: Redux Store Setup
    queueSlice.ts         # NEU: Queue Slice + Thunks
```

---

### Phase 2: IndexedDB Manager Refactoring

**Tasks:**
- [ ] Zweiten Object Store `queueImages` hinzufügen
- [ ] Metadaten und Blobs trennen
- [ ] Neue Methoden implementieren:
  - `saveImage(blob, fileName): Promise<string>`
  - `getImage(imageId): Promise<ImageData>`
  - `deleteImage(imageId): Promise<void>`
  - `saveQueueItem(item): Promise<void>`
  - `getQueueItem(id): Promise<QueueItem>`
  - `deleteQueueItem(id): Promise<void>`

**Dateien:**
```
src/
  services/
    IndexedDBManager.ts   # REFACTOR: Neue Struktur
```

**Migration:**
```typescript
// Alte Methode (mit Blobs im Item)
await queueManager.addToQueue(data, images);

// Neue Methode (Blobs separat)
const imageIds = await Promise.all(
  images.map(img => indexedDBManager.saveImage(img))
);
await indexedDBManager.saveQueueItem({ ...data, imageIds });
```

---

### Phase 3: Redux Slice Implementation

**Tasks:**
- [ ] Queue Slice mit Reducers erstellen
- [ ] Async Thunks implementieren:
  - `initQueue()` - Lädt Queue beim App-Start
  - `addToQueue()` - Neues Item hinzufügen
  - `processQueue()` - Verarbeitet pending Items
  - `updateItemStatus()` - Status-Update
  - `retryItem()` - Einzelnes Item erneut versuchen
  - `deleteItem()` - Item aus Queue entfernen

**Dateien:**
```
src/
  store/
    queueSlice.ts         # NEU: Complete Implementation
```

**Beispiel-Implementation:**

```typescript
// store/queueSlice.ts
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { indexedDBManager } from '../services/IndexedDBManager';
import { apiClient } from '../services/ApiClient';

// Thunk: Queue beim App-Start laden
export const initQueue = createAsyncThunk(
  'queue/init',
  async () => {
    const items = await indexedDBManager.getAllQueueItems();
    return items;
  }
);

// Thunk: Neues Item zur Queue hinzufügen
export const addToQueue = createAsyncThunk(
  'queue/add',
  async ({ data, images }: { data: FormData; images: File[] }) => {
    // 1. Bilder in IndexedDB speichern
    const imageIds = await Promise.all(
      images.map(async (img) => {
        const blob = await img.arrayBuffer().then(ab => new Blob([ab]));
        return indexedDBManager.saveImage(blob, img.name, img.type);
      })
    );
    
    // 2. Queue Item erstellen
    const item: QueueItem = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      status: 'pending',
      retryCount: 0,
      data,
      imageIds,
    };
    
    // 3. In IndexedDB speichern
    await indexedDBManager.saveQueueItem(item);
    
    return item;
  }
);

// Thunk: Queue verarbeiten
export const processQueue = createAsyncThunk(
  'queue/process',
  async (_, { getState, dispatch }) => {
    if (!navigator.onLine) {
      console.log('🔴 Offline - Queue processing skipped');
      return;
    }
    
    const state = getState() as RootState;
    const pendingItems = state.queue.items.filter(i => i.status === 'pending');
    
    for (const item of pendingItems) {
      try {
        // Update Status zu 'sending'
        dispatch(queueSlice.actions.itemStatusUpdated({ 
          id: item.id, 
          status: 'sending' 
        }));
        
        // Bilder aus IndexedDB laden
        const images = await Promise.all(
          item.imageIds.map(id => indexedDBManager.getImage(id))
        );
        
        // An API senden
        await apiClient.submitFormData({ ...item, images });
        
        // Erfolg: Status auf 'sent'
        dispatch(queueSlice.actions.itemStatusUpdated({ 
          id: item.id, 
          status: 'sent' 
        }));
        
        // Aus Queue entfernen
        await dispatch(deleteItem(item.id));
        
      } catch (error) {
        // Fehler: Retry-Count erhöhen
        const newRetryCount = item.retryCount + 1;
        
        if (newRetryCount >= 3) {
          // Max retries erreicht
          dispatch(queueSlice.actions.itemStatusUpdated({ 
            id: item.id, 
            status: 'error',
            error: error.message 
          }));
        } else {
          // Retry
          dispatch(queueSlice.actions.itemRetried({ 
            id: item.id,
            retryCount: newRetryCount
          }));
        }
      }
    }
  }
);

// Thunk: Item löschen
export const deleteItem = createAsyncThunk(
  'queue/delete',
  async (id: string, { getState }) => {
    const state = getState() as RootState;
    const item = state.queue.items.find(i => i.id === id);
    
    if (item) {
      // Bilder löschen
      await Promise.all(
        item.imageIds.map(imageId => indexedDBManager.deleteImage(imageId))
      );
      
      // Queue Item löschen
      await indexedDBManager.deleteQueueItem(id);
    }
    
    return id;
  }
);

// Slice
const queueSlice = createSlice({
  name: 'queue',
  initialState: {
    items: [],
    loading: false,
    error: null,
    processingItemId: null,
  } as QueueState,
  reducers: {
    // Sync Reducers für optimistische Updates
    itemStatusUpdated: (state, action) => {
      const item = state.items.find(i => i.id === action.payload.id);
      if (item) {
        item.status = action.payload.status;
        if (action.payload.error) {
          item.error = action.payload.error;
        }
      }
    },
    itemRetried: (state, action) => {
      const item = state.items.find(i => i.id === action.payload.id);
      if (item) {
        item.retryCount = action.payload.retryCount;
        item.status = 'pending';
      }
    },
  },
  extraReducers: (builder) => {
    builder
      // initQueue
      .addCase(initQueue.pending, (state) => {
        state.loading = true;
      })
      .addCase(initQueue.fulfilled, (state, action) => {
        state.items = action.payload;
        state.loading = false;
      })
      .addCase(initQueue.rejected, (state, action) => {
        state.error = action.error.message;
        state.loading = false;
      })
      
      // addToQueue
      .addCase(addToQueue.pending, (state) => {
        state.loading = true;
      })
      .addCase(addToQueue.fulfilled, (state, action) => {
        state.items.push(action.payload);
        state.loading = false;
      })
      .addCase(addToQueue.rejected, (state, action) => {
        state.error = action.error.message;
        state.loading = false;
      })
      
      // deleteItem
      .addCase(deleteItem.fulfilled, (state, action) => {
        state.items = state.items.filter(i => i.id !== action.payload);
      });
  },
});

export const { itemStatusUpdated, itemRetried } = queueSlice.actions;
export default queueSlice.reducer;

// Selectors
export const selectAllItems = (state: RootState) => state.queue.items;
export const selectPendingItems = (state: RootState) => 
  state.queue.items.filter(i => i.status === 'pending');
export const selectQueueSize = (state: RootState) => 
  state.queue.items.length;
export const selectIsLoading = (state: RootState) => 
  state.queue.loading;
```

---

### Phase 4: App Integration

**Tasks:**
- [ ] Redux Provider in `main.jsx` einbinden
- [ ] `App.jsx` refactoren:
  - `useDispatch` statt direkter QueueManager-Calls
  - `useSelector` für Queue-State
  - Queue Processing mit Redux Thunks
- [ ] Event Listeners anpassen (online/offline)

**Dateien:**
```
src/
  main.jsx              # UPDATE: Redux Provider
  App.jsx               # REFACTOR: Redux Integration
```

**Beispiel:**

```typescript
// main.jsx
import { Provider } from 'react-redux';
import { store } from './store/store';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>
);

// App.jsx
import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { initQueue, processQueue, selectQueueSize } from './store/queueSlice';

function App() {
  const dispatch = useDispatch();
  const queueSize = useSelector(selectQueueSize);

  useEffect(() => {
    // Initialize Queue beim App-Start
    dispatch(initQueue());
    
    if (navigator.onLine) {
      dispatch(processQueue());
    }
    
    // Online Event
    const handleOnline = () => {
      dispatch(processQueue());
    };
    
    window.addEventListener('online', handleOnline);
    
    // Polling-Intervall
    const interval = setInterval(() => {
      if (navigator.onLine) {
        dispatch(processQueue());
      }
    }, 30000);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      clearInterval(interval);
    };
  }, [dispatch]);
  
  // ... rest of component
}
```

---

### Phase 5: Komponenten Migration

**Tasks:**
- [ ] `SubmissionForm.jsx` refactoren:
  - `useDispatch` für `addToQueue()`
  - Entferne direkten QueueManager-Import
- [ ] `StatusBar.jsx` refactoren:
  - `useSelector` für Queue-Size
  - Entferne direkten QueueManager-Import

**Dateien:**
```
src/
  components/
    SubmissionForm.jsx    # REFACTOR: Redux dispatch
    StatusBar.jsx         # REFACTOR: Redux selector
```

**Beispiel:**

```typescript
// SubmissionForm.jsx
import { useDispatch } from 'react-redux';
import { addToQueue, processQueue } from '../store/queueSlice';

export function SubmissionForm({ onSubmitSuccess }) {
  const dispatch = useDispatch();
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const formData = { /* ... */ };
    const images = Array.from(imageInputRef.current.files);
    
    // Redux Thunk dispatchen
    await dispatch(addToQueue({ data: formData, images }));
    
    onSubmitSuccess?.();
    
    // Queue sofort verarbeiten (wenn online)
    if (navigator.onLine) {
      dispatch(processQueue());
    }
  };
  
  // ...
}

// StatusBar.jsx
import { useSelector } from 'react-redux';
import { selectQueueSize } from '../store/queueSlice';

export function StatusBar() {
  const queueSize = useSelector(selectQueueSize);
  const isOnline = useOnlineStatus();
  
  return (
    <div className="status-bar">
      <span>{isOnline ? '🟢 Online' : '🔴 Offline'}</span>
      <span>Queue: {queueSize} Items</span>
    </div>
  );
}
```

---

### Phase 6: Custom Hook für Bild-Loading

**Tasks:**
- [ ] Custom Hook `useQueueImages` erstellen
- [ ] Lazy Loading von Bildern aus IndexedDB
- [ ] Optional: Caching im Memory

**Dateien:**
```
src/
  hooks/
    useQueueImages.ts     # NEU: Hook für Image Loading
```

**Implementation:**

```typescript
// hooks/useQueueImages.ts
import { useState, useEffect } from 'react';
import { indexedDBManager } from '../services/IndexedDBManager';

export interface ImageData {
  imageId: string;
  blob: Blob;
  fileName: string;
  mimeType: string;
}

export function useQueueImages(imageIds: string[]) {
  const [images, setImages] = useState<ImageData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    if (!imageIds || imageIds.length === 0) {
      setImages([]);
      setLoading(false);
      return;
    }
    
    const loadImages = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const loadedImages = await Promise.all(
          imageIds.map(id => indexedDBManager.getImage(id))
        );
        setImages(loadedImages);
      } catch (err) {
        setError(err.message);
        console.error('Failed to load images:', err);
      } finally {
        setLoading(false);
      }
    };
    
    loadImages();
  }, [imageIds]);
  
  return { images, loading, error };
}

// Usage in Component:
function QueueItemPreview({ item }) {
  const { images, loading } = useQueueImages(item.imageIds);
  
  if (loading) return <div>Loading images...</div>;
  
  return (
    <div>
      {images.map(img => (
        <img 
          key={img.imageId} 
          src={URL.createObjectURL(img.blob)} 
          alt={img.fileName}
        />
      ))}
    </div>
  );
}
```

---

### Phase 7: Cleanup & Testing

**Tasks:**
- [ ] Alte `QueueManager.ts` Singleton-Instanz entfernen
- [ ] Alle Imports prüfen und anpassen
- [ ] TypeScript-Errors beheben
- [ ] Manual Testing:
  - Offline-Submission
  - Online-Submission
  - Retry-Logic
  - Bild-Loading
  - Browser-Refresh (Persistenz)
- [ ] Redux DevTools testen

---

## Vorteile der neuen Architektur

✅ **Konsistenz**: Einheitlich mit Rest der App (Redux)  
✅ **Reaktivität**: Automatische UI-Updates bei State-Änderungen  
✅ **Debugging**: Redux DevTools für Time-Travel-Debugging  
✅ **Serializable**: Redux State bleibt serializable (keine Blobs)  
✅ **Performance**: Kleine State-Größe im Memory  
✅ **Lazy Loading**: Bilder nur laden wenn benötigt  
✅ **Testbarkeit**: Reducer und Thunks sind isoliert testbar  

---

## Trade-offs & Überlegungen

⚠️ **Komplexität**: Mehr Boilerplate als direkter IndexedDB-Zugriff  
⚠️ **Sync-Overhead**: State muss mit IndexedDB synchron gehalten werden  
⚠️ **Zwei Sources**: Redux (Memory) + IndexedDB (Persistent) müssen konsistent sein  

**Aber**: Diese Trade-offs sind akzeptabel für eine konsistente Architektur in der echten App.

---

## Rollback-Plan

Falls Migration fehlschlägt:
1. Git-Branch für Migration verwenden
2. Bei Problemen: `git checkout main`
3. Alte `QueueManager.ts` bleibt funktional
4. Keine Breaking Changes am Backend/API nötig

---

## Nächste Schritte

1. Review dieses Plans
2. Phase 1 starten: Redux Toolkit installieren
3. Schrittweise migrieren (eine Phase nach der anderen)
4. Testing nach jeder Phase
