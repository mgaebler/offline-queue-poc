import type { QueueItemWithImages, ApiResponse } from '../types/queue';

/**
 * API Client for submitting form data
 */
class ApiClient {
    private baseURL: string;

    constructor(baseURL = 'http://localhost:3001') {
        this.baseURL = baseURL;
    }

    /**
     * Submit form data to the server
     */
    async submitFormData(queueItem: QueueItemWithImages): Promise<ApiResponse> {
        const formData = new FormData();

        // Add text fields
        Object.entries(queueItem.data).forEach(([key, value]) => {
            formData.append(key, String(value));
        });

        // Add metadata
        formData.append('queueId', queueItem.id);
        formData.append('timestamp', queueItem.timestamp.toString());

        // Add images
        queueItem.images.forEach((image, index) => {
            formData.append(`image_${index}`, image.blob, image.fileName);
        });

        console.log(`📤 Submitting item ${queueItem.id} to ${this.baseURL}/api/submit`);

        try {
            const response = await fetch(`${this.baseURL}/api/submit`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const result: ApiResponse = await response.json();
            console.log(`✅ Successfully submitted ${queueItem.id}`);

            return result;
        } catch (error) {
            console.error(`❌ Failed to submit ${queueItem.id}:`, error);
            throw error;
        }
    }

    /**
     * Check if server is reachable
     */
    async ping(): Promise<boolean> {
        try {
            const response = await fetch(`${this.baseURL}/health`, {
                method: 'GET',
                signal: AbortSignal.timeout(5000), // 5 second timeout
            });
            return response.ok;
        } catch {
            return false;
        }
    }
}

// Export singleton instance
export const apiClient = new ApiClient();
