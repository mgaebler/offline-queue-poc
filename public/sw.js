// Service Worker für Background Sync
const CACHE_NAME = 'offline-queue-v1';
const API_URL = 'http://localhost:3001';

// Install Event
self.addEventListener('install', (event) => {
  console.log('✅ Service Worker installed');
  self.skipWaiting();
});

// Activate Event
self.addEventListener('activate', (event) => {
  console.log('✅ Service Worker activated');
  event.waitUntil(self.clients.claim());
});

// Background Sync Event
self.addEventListener('sync', async (event) => {
  console.log('🔄 Background Sync event:', event.tag);
  
  if (event.tag === 'sync-queue') {
    event.waitUntil(syncQueue());
  }
});

// Queue Sync Funktion
async function syncQueue() {
  try {
    console.log('📤 Starting background queue sync...');
    
    // Import idb dynamically
    const { openDB } = await import('https://cdn.jsdelivr.net/npm/idb@8/+esm');
    
    // Open IndexedDB
    const db = await openDB('offlineQueueDB', 1);
    
    // Get all pending items
    const pendingItems = await db.getAllFromIndex('formQueue', 'by-status', 'pending');
    
    if (pendingItems.length === 0) {
      console.log('📭 Queue is empty');
      return;
    }
    
    console.log(`📦 Found ${pendingItems.length} pending items`);
    
    // Process each item
    for (const item of pendingItems) {
      try {
        // Update status to sending
        item.status = 'sending';
        await db.put('formQueue', item);
        
        // Prepare FormData
        const formData = new FormData();
        
        // Add text fields
        Object.entries(item.data).forEach(([key, value]) => {
          formData.append(key, value);
        });
        
        // Add metadata
        formData.append('queueId', item.id);
        formData.append('timestamp', item.timestamp.toString());
        
        // Add images
        item.images.forEach((image, index) => {
          formData.append(`image_${index}`, image.blob, image.fileName);
        });
        
        // Submit to API
        const response = await fetch(`${API_URL}/api/submit`, {
          method: 'POST',
          body: formData,
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        // Success - remove from queue
        await db.delete('formQueue', item.id);
        console.log(`✅ Successfully synced item ${item.id}`);
        
        // Notify client
        notifyClients({ type: 'sync-success', itemId: item.id });
        
      } catch (error) {
        console.error(`❌ Failed to sync item ${item.id}:`, error);
        
        // Increment retry count
        item.retryCount = (item.retryCount || 0) + 1;
        
        if (item.retryCount >= 3) {
          // Max retries reached
          item.status = 'error';
          item.error = error.message;
          console.log(`❌ Max retries reached for ${item.id}`);
        } else {
          // Reset to pending for retry
          item.status = 'pending';
        }
        
        await db.put('formQueue', item);
        
        // Notify client
        notifyClients({ 
          type: 'sync-error', 
          itemId: item.id, 
          retryCount: item.retryCount 
        });
      }
    }
    
    console.log('✅ Background sync completed');
    
  } catch (error) {
    console.error('❌ Background sync failed:', error);
    throw error;
  }
}

// Notify all clients
async function notifyClients(message) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  clients.forEach(client => {
    client.postMessage(message);
  });
}

// Message handler (from client)
self.addEventListener('message', (event) => {
  console.log('📨 Message from client:', event.data);
  
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
