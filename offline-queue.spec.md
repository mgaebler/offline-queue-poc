# Offline Queue POC - Spezifikation

## Projektziel

Entwicklung eines Proof of Concept für eine Offline-Queue, die Formulardaten (Text + Bilder) lokal speichert und bei bestehender Internetverbindung automatisch an einen Server sendet.

---

## 1. Technologie-Stack

### Frontend

- **Framework**: Vite + React
- **Form Handling**: react-hook-form
- **UI**: React Components mit CSS
- **Service Worker**: Workbox (Google's PWA-Library)
- **Browser-Datenbank**: IndexedDB via `idb` Package

### Backend (Mock)

- **Mock-Server**: Express.js mit Multer

**Wichtig**: json-server kann kein FormData mit Bildern verarbeiten, daher nutzen wir Express mit Multer.

### NPM Packages

```json
{
  "react": "^19.1.0",
  "react-dom": "^19.1.0",
  "react-hook-form": "^7.65.0",
  "idb": "^8.0.0",                   // IndexedDB Wrapper
  "express": "^4.18.0",              // Mock API Server
  "multer": "^1.4.5",                // FormData/File Upload Handling
  "cors": "^2.8.5",                  // CORS Middleware
  "vite-plugin-pwa": "^1.1.0"        // PWA Plugin für Vite (optional)
}
```

---

## 2. Architektur-Übersicht

```mermaid
flowchart TB
    subgraph Browser["Browser/Client"]
        direction TB
        
        subgraph UILayer["UI Layer"]
            Form["Formular<br/>Text Inputs<br/>Image Upload<br/>Submit Button"]
        end
        
        subgraph QueueMgr["Queue Manager"]
            QM["Queue Operations<br/>addToQueue<br/>getQueue<br/>removeFromQueue<br/>updateStatus"]
        end
        
        subgraph Database["IndexedDB"]
            DB["Store: formQueue<br/>id: string<br/>timestamp: number<br/>status: enum<br/>data: object<br/>images: Blob array"]
        end
        
        subgraph SW["Service Worker"]
            ServiceWorker["Online/Offline Detection<br/>Queue Processing<br/>Background Sync<br/>Retry Logic"]
        end
        
        Form -->|Submit Data| QM
        QM -->|Store| DB
        QM -->|Notify| ServiceWorker
        ServiceWorker -.->|Read Queue| DB
        ServiceWorker -->|Update Status| DB
    end
    
    ServiceWorker ==>|POST /submit when online| API["Backend API<br/>POST /submit"]
    
    style Form fill:#e1f5ff,stroke:#333,stroke-width:2px
    style QM fill:#fff4e1,stroke:#333,stroke-width:2px
    style DB fill:#e8f5e9,stroke:#333,stroke-width:2px
    style ServiceWorker fill:#f3e5f5,stroke:#333,stroke-width:2px
    style API fill:#ffebee,stroke:#333,stroke-width:2px
```

---

## 3. Datenbank-Schema (IndexedDB)

### Object Store: `formQueue`

```typescript
interface QueueItem {
  id: string;              // UUID v4
  timestamp: number;       // Date.now()
  status: 'pending' | 'sending' | 'sent' | 'error';
  retryCount: number;      // Anzahl Wiederholungsversuche
  data: {
    textField1: string;
    textField2: string;
    // ... weitere Textfelder
  };
  images: Array<{
    fieldName: string;
    blob: Blob;            // Bild als Blob
    fileName: string;
    mimeType: string;
  }>;
  error?: string;          // Fehlermeldung bei gescheiterten Versuchen
}
```

### Indices

- `status`: Für schnelle Abfrage nach Status
- `timestamp`: Für chronologische Sortierung

---

## 4. Komponenten-Beschreibung

### 4.1 Formular (UI)

**Datei**: `src/components/FormComponent.js`

**Features**:

- Eingabefelder für Text (z.B. Name, Beschreibung)
- File-Input für Bilder (multiple)
- Submit-Button
- Status-Anzeige (Online/Offline)
- Queue-Counter (Anzahl ausstehender Einträge)
- Vorschau hochgeladener Bilder

**Validierung**:

- Pflichtfelder prüfen
- Bildgröße limitieren (z.B. max 5MB pro Bild)
- Erlaubte Bildformate: JPG, PNG, WebP

---

### 4.2 Queue Manager

**Datei**: `src/services/QueueManager.js`

**Methoden**:

```javascript
class QueueManager {
  // Eintrag zur Queue hinzufügen
  async addToQueue(formData, images): Promise<string>
  
  // Alle Queue-Einträge abrufen
  async getQueueItems(status?: string): Promise<QueueItem[]>
  
  // Eintrag aus Queue entfernen
  async removeFromQueue(id: string): Promise<void>
  
  // Status eines Eintrags aktualisieren
  async updateStatus(id: string, status: string): Promise<void>
  
  // Queue-Größe abrufen
  async getQueueSize(): Promise<number>
  
  // Alle 'pending' Items abrufen
  async getPendingItems(): Promise<QueueItem[]>
}
```

---

### 4.3 Service Worker

**Datei**: `public/sw.js` (via Workbox generiert)

**Verantwortlichkeiten**:

1. **Online/Offline Detection**
   - `navigator.onLine` Event Listener
   - Periodische Connectivity-Checks (optional)

2. **Queue Processing**
   - Bei Online-Status: Pending Items verarbeiten
   - Retry-Logik bei Fehlern
   - Exponential Backoff bei wiederholten Fehlern

3. **Background Sync** (Optional, fortgeschritten)
   - `sync` Event für automatische Synchronisation
   - Auch wenn Browser im Hintergrund läuft

**Events**:

```javascript
// Online-Event
self.addEventListener('online', async () => {
  await processQueue();
});

// Background Sync (optional)
self.addEventListener('sync', async (event) => {
  if (event.tag === 'sync-queue') {
    event.waitUntil(processQueue());
  }
});
```

---

### 4.4 API Client

**Datei**: `src/services/ApiClient.js`

**Methode**:

```javascript
async function submitFormData(queueItem) {
  const formData = new FormData();
  
  // Text-Daten hinzufügen
  Object.entries(queueItem.data).forEach(([key, value]) => {
    formData.append(key, value);
  });
  
  // Bilder hinzufügen
  queueItem.images.forEach((image, index) => {
    formData.append(`image_${index}`, image.blob, image.fileName);
  });
  
  const response = await fetch('/api/submit', {
    method: 'POST',
    body: formData
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  
  return await response.json();
}
```

---

## 5. Workflow / User Flow

### Konzept: Alle Requests über Queue

**Wichtig**: Alle Form-Submissions laufen IMMER über die Queue - unabhängig vom Online-Status.

```
User Submit → Queue (IndexedDB) → Queue Processor → API
                 ↓
          Immer gespeichert
                 ↓
          Verarbeitung wenn online
```

### Vorteile

- ✅ Konsistente Logik (kein Unterschied zwischen online/offline)
- ✅ Robustheit (auch bei instabiler Verbindung keine Datenverluste)
- ✅ Retry-Mechanismus funktioniert für alle Requests
- ✅ Persistenz (Browser-Refresh verliert keine Daten)

### Szenario 1: Online-Submission

1. User füllt Formular aus
2. User klickt "Submit"
3. **Daten werden zur Queue hinzugefügt** (Status: `pending`)
4. Queue-Processor wird sofort aufgerufen
5. Prüft: `navigator.onLine` = true
6. Daten werden an Server gesendet
7. Bei Erfolg: Eintrag aus Queue entfernen
8. User erhält Erfolgsmeldung

### Szenario 2: Offline-Submission

1. User füllt Formular aus (Offline)
2. User klickt "Submit"
3. **Daten werden in Queue gespeichert** (Status: `pending`)
4. Queue-Processor wird aufgerufen
5. Prüft: `navigator.onLine` = false
6. Überspringt Verarbeitung mit Log: "🔴 Offline - Queue processing skipped"
7. User sieht "📦 In Queue gespeichert" Meldung
8. User kann weitere Formulare ausfüllen (alle landen in Queue)
9. Verbindung wird wiederhergestellt
10. Online-Event triggert Queue-Processing
11. Automatische Verarbeitung aller pending Items
12. User erhält Notifications über erfolgreiche Übermittlung

---

## 6. Error Handling & Retry-Strategie

### Queue Processing Flow

```javascript
async function processQueue() {
  // Nur verarbeiten wenn online
  if (!navigator.onLine) {
    console.log('🔴 Offline - Queue processing skipped');
    return;
  }

  const pendingItems = await queueManager.getPendingItems();
  
  for (const item of pendingItems) {
    try {
      await queueManager.updateStatus(item.id, 'sending');
      await apiClient.submitFormData(item);
      await queueManager.updateStatus(item.id, 'sent');
      await queueManager.removeFromQueue(item.id);
      // Success notification
    } catch (error) {
      const retryCount = await queueManager.incrementRetryCount(item.id);
      
      if (retryCount >= 3) {
        await queueManager.updateStatus(item.id, 'error', error.message);
        // Error notification
      } else {
        await queueManager.updateStatus(item.id, 'pending');
        // Will retry on next trigger
      }
    }
  }
}
```

### Trigger-Punkte für Queue-Processing

1. **Nach jedem Form-Submit** (sofort, wenn online)
2. **Online-Event** (window.addEventListener('online'))
3. **App-Start** (beim Laden, falls online und Queue nicht leer)

### Retry-Logik

```javascript
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 5000, 15000]; // 1s, 5s, 15s

async function processQueueItem(item) {
  try {
    await submitFormData(item);
    await updateStatus(item.id, 'sent');
  } catch (error) {
    if (item.retryCount < MAX_RETRIES) {
      await updateRetryCount(item.id, item.retryCount + 1);
      const delay = RETRY_DELAYS[item.retryCount];
      setTimeout(() => processQueueItem(item), delay);
    } else {
      await updateStatus(item.id, 'error');
      await saveError(item.id, error.message);
    }
  }
}
```

### Error-Kategorien

- **Network Error**: Retry
- **4xx Client Error**: Nicht retryen, als Error markieren
- **5xx Server Error**: Retry mit Backoff
- **Timeout**: Retry

---

## 7. UI/UX Überlegungen

### Status-Indikator

```
┌─────────────────────────────┐
│ ● Online  │  Queue: 3 Items │
└─────────────────────────────┘
```

### Queue-Übersicht (Optional)

Eine Liste mit ausstehenden Einträgen:

- Timestamp
- Status
- Retry-Count
- Fehlermeldung (falls vorhanden)
- Manueller "Retry" Button

### Notifications

- Browser-Notifications bei erfolgreicher Übermittlung
- Toast-Messages für User-Feedback

---

## 8. Sicherheitsüberlegungen

1. **Datenbereinigung**: Erfolgreich gesendete Items nach X Tagen löschen
2. **Quota Management**: IndexedDB Storage-Limits beachten
3. **Sensitive Daten**: HTTPS erforderlich für Service Worker
4. **XSS**: User-Input sanitizen vor Anzeige

---

## 9. Testing-Strategie

> **TODO**: Wird noch definiert

---

---

## 9. Testing-Strategie

> **TODO**: Wird noch definiert

---

## 10. Implementierungs-Schritte

### Phase 1: Basis-Setup

- [ ] Vite-Projekt erstellen
- [ ] Grundlegendes HTML-Formular
- [ ] IndexedDB Setup mit `idb` Package

### Phase 2: Queue Manager

- [ ] QueueManager-Klasse implementieren
- [ ] CRUD-Operationen für Queue-Items
- [ ] Unit Tests

### Phase 3: Service Worker

- [ ] Workbox konfigurieren
- [ ] Online/Offline Detection
- [ ] Queue Processing Logik

### Phase 4: Integration

- [ ] Formular mit Queue Manager verbinden
- [ ] API Client implementieren
- [ ] Mock-Server für Tests

### Phase 5: Polish

- [ ] UI-Verbesserungen
- [ ] Error Handling verfeinern
- [ ] Notifications implementieren
- [ ] Performance-Optimierung

---

## 11. Technische Entscheidungen ✅

1. **Backend**: ✅ JSON-Server (npm package) für Mock-API
   - Schnelles Setup, perfekt für POC
   - Automatisches REST-API aus JSON-Datei

2. **Framework**: ✅ React + react-hook-form
   - Strukturierte Komponenten-Architektur
   - react-hook-form für optimales Formular-Handling
   - Vite als Build-Tool

3. **Bildkompression**: ✅ Keine Kompression
   - Originalbilder speichern
   - Reduziert Komplexität im POC
   - Kann später bei Bedarf ergänzt werden

4. **Priorisierung**: ✅ FIFO (First In, First Out)
   - Einfache chronologische Verarbeitung nach Timestamp
   - Ausreichend für POC
   - Erweiterbar falls nötig

5. **Batch-Upload**: ✅ Einzeln (1 Item pro Request)
   - Besseres Fehler-Handling
   - Granulares Status-Update pro Item
   - Klarere User-Experience

6. **Background Sync**: ✅ Nur bei offenem Browser
   - Online/Offline Event Listener im Service Worker
   - Funktioniert in allen Browsern
   - Einfacher zu implementieren & debuggen
   - Background Sync API als späteres "Nice-to-Have"

---

## 12. Weitere Optimierungen (Nice-to-Have)

- **Image Compression**: z.B. mit `browser-image-compression`
- **Progress Indication**: Upload-Progress für große Dateien
- **Conflict Resolution**: Was wenn gleiche Daten mehrfach submitted werden?
- **Queue Prioritization**: Wichtige Items zuerst verarbeiten
- **Partial Uploads**: Große Dateien in Chunks hochladen
- **IndexedDB Migrations**: Schema-Versionierung

---

## Nächste Schritte

Welche Aspekte möchtest du zuerst detaillierter besprechen?

- Technologie-Entscheidungen (Vanilla JS vs Framework?)
- Datenbank-Schema verfeinern?
- Service Worker Implementierungs-Details?
- Mock-Server Setup?
