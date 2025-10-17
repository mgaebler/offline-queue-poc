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
 * Queue Item Structure
 */
export interface QueueItem {
    id: string;
    timestamp: number;
    status: QueueItemStatus;
    retryCount: number;
    data: FormData;
    images: ImageData[];
    error?: string;
}

/**
 * API Response
 */
export interface ApiResponse {
    success: boolean;
    message: string;
    id?: string;
}
