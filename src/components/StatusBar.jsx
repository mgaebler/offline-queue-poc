import { useState, useEffect } from 'react';
import { queueManager } from '../services/QueueManager';
import './StatusBar.css';

export function StatusBar() {
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [queueSize, setQueueSize] = useState(0);

    useEffect(() => {
        // Update online status
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Update queue size
        const updateQueueSize = async () => {
            const size = await queueManager.getQueueSize();
            setQueueSize(size);
        };

        updateQueueSize();

        // Listen for queue updates
        window.addEventListener('queue-updated', updateQueueSize);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            window.removeEventListener('queue-updated', updateQueueSize);
        };
    }, []);

    return (
        <div className="status-bar">
            <div className={`status-indicator ${isOnline ? 'online' : 'offline'}`}>
                <span className="status-dot"></span>
                <span className="status-text">
                    {isOnline ? '🟢 Online' : '🔴 Offline'}
                </span>
            </div>

            <div className="queue-counter" data-testid="queue-counter">
                📦 Queue: <strong>{queueSize}</strong> {queueSize === 1 ? 'Item' : 'Items'}
            </div>
        </div>
    );
}
