import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { QueueItem, FormData } from '../store/queue';

/**
 * Image data stored in IndexedDB
 */
export interface ImageData {
    imageId: string;
    blob: Blob;
    fileName: string;
    mimeType: string;
    uploadedAt: number;
}

/**
 * Queue item for IndexedDB (without full image blobs)
 */
export interface QueueItemDB {
    id: string;
    timestamp: number;
    status: 'pending' | 'sending' | 'sent' | 'error';
    retryCount: number;
    data: FormData;
    imageIds: string[];  // References to queueImages store
    error?: string;
}

/**
 * IndexedDB Schema with two separate stores
 */
interface QueueDB extends DBSchema {
    // Store 1: Queue metadata (without blobs)
    formQueue: {
        key: string;
        value: QueueItemDB;
        indexes: {
            'by-status': string;
            'by-timestamp': number;
        };
    };
    // Store 2: Images (blobs)
    queueImages: {
        key: string;  // imageId
        value: ImageData;
    };
}

/**
 * IndexedDB Manager for Queue and Image Storage
 */
class IndexedDBManager {
    private dbName = 'offlineQueueDB';
    private version = 2;  // Incremented for schema change
    private db: IDBPDatabase<QueueDB> | null = null;

    /**
     * Initialize and open the database
     */
    async init(): Promise<void> {
        this.db = await openDB<QueueDB>(this.dbName, this.version, {
            upgrade(db, oldVersion, newVersion, transaction) {
                // Create formQueue store if it doesn't exist
                if (!db.objectStoreNames.contains('formQueue')) {
                    const formStore = db.createObjectStore('formQueue', {
                        keyPath: 'id'
                    });
                    formStore.createIndex('by-status', 'status');
                    formStore.createIndex('by-timestamp', 'timestamp');
                }

                // Create queueImages store (new in version 2)
                if (!db.objectStoreNames.contains('queueImages')) {
                    db.createObjectStore('queueImages', {
                        keyPath: 'imageId'
                    });
                }

                // Migration: Convert old items with images to new structure
                if (oldVersion === 1 && newVersion === 2) {
                    console.log('🔄 Migrating IndexedDB from v1 to v2...');
                    // Note: Old items with embedded images will need manual migration
                    // For now, we'll just keep them and handle missing imageIds gracefully
                }
            },
        });
        console.log('✅ IndexedDB initialized (version 2)');
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
        return crypto.randomUUID ? crypto.randomUUID() :
            'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
                const r = Math.random() * 16 | 0;
                const v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
    }

    // ==================== Queue Item Operations ====================

    /**
     * Save queue item to IndexedDB
     */
    async saveQueueItem(item: QueueItemDB): Promise<void> {
        const db = await this.ensureDB();
        await db.put('formQueue', item);
        console.log('✅ Queue item saved:', item.id);
    }

    /**
     * Get single queue item
     */
    async getQueueItem(id: string): Promise<QueueItemDB | undefined> {
        const db = await this.ensureDB();
        return await db.get('formQueue', id);
    }

    /**
     * Get all queue items
     */
    async getAllQueueItems(): Promise<QueueItemDB[]> {
        const db = await this.ensureDB();
        const items = await db.getAll('formQueue');
        return items.sort((a, b) => a.timestamp - b.timestamp);
    }

    /**
     * Get queue items by status
     */
    async getQueueItemsByStatus(status: string): Promise<QueueItemDB[]> {
        const db = await this.ensureDB();
        return await db.getAllFromIndex('formQueue', 'by-status', status);
    }

    /**
     * Delete queue item
     */
    async deleteQueueItem(id: string): Promise<void> {
        const db = await this.ensureDB();
        await db.delete('formQueue', id);
        console.log('🗑️ Queue item deleted:', id);
    }

    /**
     * Get queue size
     */
    async getQueueSize(): Promise<number> {
        const db = await this.ensureDB();
        return await db.count('formQueue');
    }

    // ==================== Image Operations ====================

    /**
     * Save image to IndexedDB and return imageId
     */
    async saveImage(blob: Blob, fileName: string, mimeType: string): Promise<string> {
        const db = await this.ensureDB();

        const imageData: ImageData = {
            imageId: this.generateUUID(),
            blob,
            fileName,
            mimeType,
            uploadedAt: Date.now(),
        };

        await db.put('queueImages', imageData);
        console.log('✅ Image saved:', imageData.imageId, fileName);

        return imageData.imageId;
    }

    /**
     * Get image from IndexedDB
     */
    async getImage(imageId: string): Promise<ImageData | undefined> {
        const db = await this.ensureDB();
        return await db.get('queueImages', imageId);
    }

    /**
     * Get multiple images
     */
    async getImages(imageIds: string[]): Promise<ImageData[]> {
        const images = await Promise.all(
            imageIds.map(id => this.getImage(id))
        );
        return images.filter((img): img is ImageData => img !== undefined);
    }

    /**
     * Delete image from IndexedDB
     */
    async deleteImage(imageId: string): Promise<void> {
        const db = await this.ensureDB();
        await db.delete('queueImages', imageId);
        console.log('🗑️ Image deleted:', imageId);
    }

    /**
     * Delete multiple images
     */
    async deleteImages(imageIds: string[]): Promise<void> {
        await Promise.all(imageIds.map(id => this.deleteImage(id)));
    }

    // ==================== Utility Methods ====================

    /**
     * Clear all sent items (cleanup)
     */
    async clearSentItems(): Promise<number> {
        const sentItems = await this.getQueueItemsByStatus('sent');

        for (const item of sentItems) {
            // Delete associated images
            await this.deleteImages(item.imageIds);
            // Delete queue item
            await this.deleteQueueItem(item.id);
        }

        console.log(`🧹 Cleared ${sentItems.length} sent items`);
        return sentItems.length;
    }

    /**
     * Get all items for debugging
     */
    async debugGetAll(): Promise<QueueItemDB[]> {
        const db = await this.ensureDB();
        return await db.getAll('formQueue');
    }

    /**
     * Get all images for debugging
     */
    async debugGetAllImages(): Promise<ImageData[]> {
        const db = await this.ensureDB();
        return await db.getAll('queueImages');
    }
}

// Export singleton instance
export const indexedDBManager = new IndexedDBManager();
