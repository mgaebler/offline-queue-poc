import { useEffect, useState, useCallback } from 'react';
import { StatusBar } from './components/StatusBar';
import { SubmissionForm } from './components/SubmissionForm';
import { queueManager } from './services/QueueManager';
import { apiClient } from './services/ApiClient';
import './App.css';

function App() {
  const [notification, setNotification] = useState(null);

  const showNotification = useCallback((message, type = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  }, []);

  const processQueue = useCallback(async () => {
    // Only process if online
    if (!navigator.onLine) {
      console.log('🔴 Offline - Queue processing skipped');
      return;
    }

    const pendingItems = await queueManager.getPendingItems();

    if (pendingItems.length === 0) {
      console.log('📭 Queue is empty');
      return;
    }

    console.log(`📤 Processing ${pendingItems.length} pending items...`);

    for (const item of pendingItems) {
      try {
        // Update status to sending
        await queueManager.updateStatus(item.id, 'sending');

        // Submit to API
        await apiClient.submitFormData(item);

        // Mark as sent
        await queueManager.updateStatus(item.id, 'sent');

        // Remove from queue after successful send
        await queueManager.removeFromQueue(item.id);

        showNotification(`✅ Item erfolgreich übermittelt`, 'success');

      } catch (error) {
        console.error(`❌ Failed to submit item ${item.id}:`, error);

        // Increment retry count
        const retryCount = await queueManager.incrementRetryCount(item.id);

        if (retryCount >= 3) {
          // Max retries reached
          await queueManager.updateStatus(item.id, 'error', error.message);
          showNotification(`❌ Item konnte nicht übermittelt werden (${retryCount} Versuche)`, 'error');
        } else {
          // Reset to pending for retry
          await queueManager.updateStatus(item.id, 'pending');
          showNotification(`⚠️ Wiederholung ${retryCount}/3`, 'warning');
        }
      }
    }

    // Trigger UI update
    window.dispatchEvent(new Event('queue-updated'));
  }, [showNotification]);

  useEffect(() => {
    // Initialize IndexedDB and process queue
    const initAndProcess = async () => {
      await queueManager.init();
      console.log('✅ Queue Manager initialized');

      // Process existing queue items on mount (if online)
      if (navigator.onLine) {
        await processQueue();
      }
    };

    initAndProcess();

    // Process queue when coming online
    const handleOnline = async () => {
      console.log('🌐 Connection restored - processing queue...');
      await processQueue();
    };

    window.addEventListener('online', handleOnline);

    // Set up interval to retry pending items every 30 seconds (only when online)
    const retryInterval = setInterval(() => {
      if (navigator.onLine) {
        console.log('🔄 Retry interval - checking queue...');
        processQueue();
      }
    }, 30000); // 30 seconds

    return () => {
      window.removeEventListener('online', handleOnline);
      clearInterval(retryInterval);
    };
  }, [processQueue]);

  const handleSubmitSuccess = useCallback(() => {
    showNotification('📦 In Queue gespeichert', 'info');

    // Always process queue immediately (will only work if online)
    processQueue();
  }, [showNotification, processQueue]);

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
