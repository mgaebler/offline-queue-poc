import { configureStore } from '@reduxjs/toolkit';
import queueReducer from './queueSlice';

export const store = configureStore({
    reducer: {
        queue: queueReducer,
    },
    // Middleware configuration for non-serializable values (Blobs will be in IndexedDB, not in state)
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
            serializableCheck: {
                // Ignore these action types if needed
                ignoredActions: [],
                // Ignore these field paths in all actions
                ignoredActionPaths: [],
                // Ignore these paths in the state
                ignoredPaths: [],
            },
        }),
});

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
