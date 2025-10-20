import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import type { QueueItem, QueueItemStatus, FormData } from '../types/queue';
import { indexedDBManager, type QueueItemDB, type ImageData } from '../services/IndexedDBManager';
import { apiClient } from '../services/ApiClient';

// State interface
interface QueueState {
    items: QueueItem[];
    loading: boolean;
    error: string | null;
    processingItemId: string | null;
}

// Initial state
const initialState: QueueState = {
    items: [],
    loading: false,
    error: null,
    processingItemId: null,
};

// ==================== Async Thunks ====================

/**
 * Initialize queue - Load items from IndexedDB on app start
 */
export const initQueue = createAsyncThunk(
    'queue/init',
    async () => {
        await indexedDBManager.init();
        const items = await indexedDBManager.getAllQueueItems();
        // QueueItemDB and QueueItem are now compatible (both use imageIds)
        return items;
    }
);

/**
 * Add new item to queue
 * Images are already saved to IndexedDB, we just get their IDs
 */
export const addToQueue = createAsyncThunk(
    'queue/add',
    async ({ data, imageIds }: { data: FormData; imageIds: string[] }) => {
        // Create queue item with pre-saved image IDs
        const item: QueueItemDB = {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            status: 'pending',
            retryCount: 0,
            data,
            imageIds,
        };

        // Save to IndexedDB
        await indexedDBManager.saveQueueItem(item);

        return item;
    }
);

/**
 * Process all pending items in the queue
 */
export const processQueue = createAsyncThunk(
    'queue/process',
    async (_, { getState, dispatch }) => {
        if (!navigator.onLine) {
            console.log('🔴 Offline - Queue processing skipped');
            return;
        }

        const state = getState() as { queue: QueueState };
        const pendingItems = state.queue.items.filter(i => i.status === 'pending');

        if (pendingItems.length === 0) {
            console.log('📭 Queue is empty');
            return;
        }

        console.log(`📤 Processing ${pendingItems.length} pending items...`);

        for (const item of pendingItems) {
            try {
                // Update status to 'sending'
                dispatch(itemStatusUpdated({ id: item.id, status: 'sending' }));

                // Load images from IndexedDB
                const images = await indexedDBManager.getImages(item.imageIds);

                // Submit to API
                await apiClient.submitFormData({
                    ...item,
                    images: images.map(img => ({
                        fieldName: 'image',
                        blob: img.blob,
                        fileName: img.fileName,
                        mimeType: img.mimeType,
                    })),
                });

                // Success: Update status to 'sent'
                dispatch(itemStatusUpdated({ id: item.id, status: 'sent' }));

                // Remove from queue
                await dispatch(deleteItem(item.id));

            } catch (error) {
                console.error(`❌ Failed to submit item ${item.id}:`, error);

                // Increment retry count
                const newRetryCount = item.retryCount + 1;

                if (newRetryCount >= 3) {
                    // Max retries reached
                    dispatch(itemStatusUpdated({
                        id: item.id,
                        status: 'error',
                        error: error instanceof Error ? error.message : 'Unknown error',
                    }));

                    // Update in IndexedDB
                    const dbItem = await indexedDBManager.getQueueItem(item.id);
                    if (dbItem) {
                        dbItem.status = 'error';
                        dbItem.error = error instanceof Error ? error.message : 'Unknown error';
                        await indexedDBManager.saveQueueItem(dbItem);
                    }
                } else {
                    // Retry
                    dispatch(itemRetried({ id: item.id, retryCount: newRetryCount }));

                    // Update in IndexedDB
                    const dbItem = await indexedDBManager.getQueueItem(item.id);
                    if (dbItem) {
                        dbItem.retryCount = newRetryCount;
                        dbItem.status = 'pending';
                        await indexedDBManager.saveQueueItem(dbItem);
                    }
                }
            }
        }
    }
);

/**
 * Delete item from queue
 */
export const deleteItem = createAsyncThunk(
    'queue/delete',
    async (id: string, { getState }) => {
        const state = getState() as { queue: QueueState };
        const item = state.queue.items.find(i => i.id === id);

        if (item) {
            // Delete images from IndexedDB
            await indexedDBManager.deleteImages(item.imageIds);

            // Delete queue item from IndexedDB
            await indexedDBManager.deleteQueueItem(id);
        }

        return id;
    }
);

// Queue Slice
const queueSlice = createSlice({
    name: 'queue',
    initialState,
    reducers: {
        // Sync reducers for optimistic updates
        itemStatusUpdated: (state, action: PayloadAction<{ id: string; status: QueueItemStatus; error?: string }>) => {
            const item = state.items.find(i => i.id === action.payload.id);
            if (item) {
                item.status = action.payload.status;
                if (action.payload.error) {
                    item.error = action.payload.error;
                }
            }
        },
        itemRetried: (state, action: PayloadAction<{ id: string; retryCount: number }>) => {
            const item = state.items.find(i => i.id === action.payload.id);
            if (item) {
                item.retryCount = action.payload.retryCount;
                item.status = 'pending';
            }
        },
        processingItemSet: (state, action: PayloadAction<string | null>) => {
            state.processingItemId = action.payload;
        },
    },
    extraReducers: (builder) => {
        builder
            // initQueue
            .addCase(initQueue.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(initQueue.fulfilled, (state, action) => {
                state.items = action.payload;
                state.loading = false;
            })
            .addCase(initQueue.rejected, (state, action) => {
                state.error = action.error.message || 'Failed to initialize queue';
                state.loading = false;
            })

            // addToQueue
            .addCase(addToQueue.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(addToQueue.fulfilled, (state, action) => {
                state.items.push(action.payload);
                state.loading = false;
            })
            .addCase(addToQueue.rejected, (state, action) => {
                state.error = action.error.message || 'Failed to add item to queue';
                state.loading = false;
            })

            // processQueue
            .addCase(processQueue.pending, (state) => {
                state.loading = true;
            })
            .addCase(processQueue.fulfilled, (state) => {
                state.loading = false;
            })
            .addCase(processQueue.rejected, (state, action) => {
                state.error = action.error.message || 'Failed to process queue';
                state.loading = false;
            })

            // deleteItem
            .addCase(deleteItem.fulfilled, (state, action) => {
                state.items = state.items.filter(i => i.id !== action.payload);
            });
    },
});

// Export actions
export const { itemStatusUpdated, itemRetried, processingItemSet } = queueSlice.actions;

// Selectors
export const selectAllItems = (state: { queue: QueueState }) => state.queue.items;
export const selectPendingItems = (state: { queue: QueueState }) =>
    state.queue.items.filter((i: QueueItem) => i.status === 'pending');
export const selectQueueSize = (state: { queue: QueueState }) =>
    state.queue.items.length;
export const selectIsLoading = (state: { queue: QueueState }) =>
    state.queue.loading;
export const selectError = (state: { queue: QueueState }) =>
    state.queue.error;
export const selectProcessingItemId = (state: { queue: QueueState }) =>
    state.queue.processingItemId;

// Export reducer
export default queueSlice.reducer;
