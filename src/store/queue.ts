/**
 * Queue Item Status
 */
export type QueueItemStatus = 'pending' | 'sending' | 'sent' | 'error';

/**
 * Image Data Structure
 */
export interface ImageData {
    fieldName: string;
    blob: Blob;
    fileName: string;
    mimeType: string;
}

/**
 * Form Data Structure
 */
export interface FormData {
    title: string;
    description: string;
    [key: string]: string; // Allow additional fields
}

/**
 * Queue Item Structure (Redux State)
 * Images are stored separately in IndexedDB, only IDs in state
 */
export interface QueueItem {
    id: string;
    timestamp: number;
    status: QueueItemStatus;
    retryCount: number;
    data: FormData;
    imageIds: string[];  // References to images in IndexedDB
    error?: string;
}

/**
 * Queue Item with loaded images (for API submission)
 */
export interface QueueItemWithImages extends Omit<QueueItem, 'imageIds'> {
    images: ImageData[];
}

/**
 * API Response
 */
export interface ApiResponse {
    success: boolean;
    message: string;
    id?: string;
}
