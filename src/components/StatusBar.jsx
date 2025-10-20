import { useState, useEffect } from 'react';
import { useAppSelector } from '../store/hooks';
import { selectQueueSize } from '../store/queueSlice';
import './StatusBar.css';

export function StatusBar() {
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const queueSize = useAppSelector(selectQueueSize);

    useEffect(() => {
        // Update online status
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
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
