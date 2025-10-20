import { useEffect, useState, useCallback } from 'react';
import { useAppDispatch } from './store/hooks';
import { initQueue, processQueue } from './store/queueSlice';
import { StatusBar } from './components/StatusBar';
import { SubmissionForm } from './components/SubmissionForm';
import './App.css';

function App() {
  const dispatch = useAppDispatch();
  const [notification, setNotification] = useState(null);

  const showNotification = useCallback((message, type = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  }, []);

  const handleProcessQueue = useCallback(() => {
    dispatch(processQueue());
  }, [dispatch]);

  useEffect(() => {
    // Initialize Queue from IndexedDB
    dispatch(initQueue());

    // Process queue if online on mount
    if (navigator.onLine) {
      handleProcessQueue();
    }

    // Process queue when coming online
    const handleOnline = () => {
      console.log('🌐 Connection restored - processing queue...');
      handleProcessQueue();
    };

    window.addEventListener('online', handleOnline);

    // Set up interval to retry pending items every 30 seconds (only when online)
    const retryInterval = setInterval(() => {
      if (navigator.onLine) {
        console.log('🔄 Retry interval - checking queue...');
        handleProcessQueue();
      }
    }, 30000); // 30 seconds

    return () => {
      window.removeEventListener('online', handleOnline);
      clearInterval(retryInterval);
    };
  }, [dispatch, handleProcessQueue]);

  const handleSubmitSuccess = useCallback(() => {
    showNotification('📦 In Queue gespeichert', 'info');

    // Always process queue immediately (will only work if online)
    if (navigator.onLine) {
      handleProcessQueue();
    }
  }, [showNotification, handleProcessQueue]);

  return (
    <div className="app">
      <StatusBar />

      <main className="main-content">
        <h1>Offline Queue POC</h1>
        <p className="subtitle">
          Alle Formulardaten laufen über eine Queue und werden automatisch übermittelt
        </p>

        <SubmissionForm onSubmitSuccess={handleSubmitSuccess} />

        {notification && (
          <div className={`notification ${notification.type}`}>
            {notification.message}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
