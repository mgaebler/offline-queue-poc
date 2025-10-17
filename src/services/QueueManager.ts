import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { QueueItem, FormData, ImageData, QueueItemStatus } from '../types/queue';

/**
 * IndexedDB Schema Definition
 */
interface QueueDB extends DBSchema {
    formQueue: {
        key: string;
        value: QueueItem;
        indexes: {
            'by-status': string;
            'by-timestamp': number;
        };
    };
}

/**
 * Queue Manager for IndexedDB Operations
 */
class QueueManager {
    private dbName = 'offlineQueueDB';
    private version = 1;
    private db: IDBPDatabase<QueueDB> | null = null;

    /**
     * Initialize and open the database
     */
    async init(): Promise<void> {
        this.db = await openDB<QueueDB>(this.dbName, this.version, {
            upgrade(db) {
                // Create object store if it doesn't exist
                if (!db.objectStoreNames.contains('formQueue')) {
                    const store = db.createObjectStore('formQueue', {
                        keyPath: 'id'
                    });

                    // Create indices
                    store.createIndex('by-status', 'status');
                    store.createIndex('by-timestamp', 'timestamp');
                }
            },
        });
    }

    /**
     * Ensure database is initialized
     */
    private async ensureDB(): Promise<IDBPDatabase<QueueDB>> {
        if (!this.db) {
            await this.init();
        }
        return this.db!;
    }

    /**
     * Generate UUID v4
     */
    private generateUUID(): string {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * Add item to queue
     */
    async addToQueue(data, images) {
    const db = await this.getDB();

    const item = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      status: 'pending',
      retryCount: 0,
      data,
      images,
    };

    await db.add('formQueue', item);
    console.log('Added to queue:', item);
    
    // Trigger Background Sync
    await this.requestBackgroundSync();
    
    return item;
  }

  async requestBackgroundSync() {
    try {
      if ('serviceWorker' in navigator && 'sync' in ServiceWorkerRegistration.prototype) {
        const registration = await navigator.serviceWorker.ready;
        await registration.sync.register('sync-queue');
        console.log('🔄 Background Sync registered');
      } else {
        console.warn('⚠️ Background Sync not supported');
      }
    } catch (error) {
      console.error('❌ Background Sync registration failed:', error);
    }
  }

    /**
     * Get all queue items (optionally filter by status)
     */
    async getQueueItems(status?: QueueItemStatus): Promise<QueueItem[]> {
        const db = await this.ensureDB();

        if (status) {
            // Get items by status index
            return await db.getAllFromIndex('formQueue', 'by-status', status);
        }

        // Get all items, sorted by timestamp (FIFO)
        const items = await db.getAll('formQueue');
        return items.sort((a, b) => a.timestamp - b.timestamp);
    }

    /**
     * Get pending items only
     */
    async getPendingItems(): Promise<QueueItem[]> {
        return this.getQueueItems('pending');
    }

    /**
     * Update item status
     */
    async updateStatus(id: string, status: QueueItemStatus, error?: string): Promise<void> {
        const db = await this.ensureDB();
        const item = await db.get('formQueue', id);

        if (!item) {
            throw new Error(`Queue item with id ${id} not found`);
        }

        item.status = status;
        if (error) {
            item.error = error;
        }

        await db.put('formQueue', item);
        console.log(`📝 Updated status for ${id}:`, status);
    }

    /**
     * Increment retry count
     */
    async incrementRetryCount(id: string): Promise<number> {
        const db = await this.ensureDB();
        const item = await db.get('formQueue', id);

        if (!item) {
            throw new Error(`Queue item with id ${id} not found`);
        }

        item.retryCount += 1;
        await db.put('formQueue', item);

        return item.retryCount;
    }

    /**
     * Remove item from queue
     */
    async removeFromQueue(id: string): Promise<void> {
        const db = await this.ensureDB();
        await db.delete('formQueue', id);
        console.log('🗑️ Removed from queue:', id);
    }

    /**
     * Get queue size
     */
    async getQueueSize(): Promise<number> {
        const db = await this.ensureDB();
        return await db.count('formQueue');
    }

    /**
     * Clear all items with 'sent' status (cleanup)
     */
    async clearSentItems(): Promise<number> {
        const sentItems = await this.getQueueItems('sent');

        for (const item of sentItems) {
            await this.removeFromQueue(item.id);
        }

        console.log(`🧹 Cleared ${sentItems.length} sent items`);
        return sentItems.length;
    }

    /**
     * Get all items for debugging
     */
    async debugGetAll(): Promise<QueueItem[]> {
        const db = await this.ensureDB();
        return await db.getAll('formQueue');
    }
}

// Export singleton instance
export const queueManager = new QueueManager();
