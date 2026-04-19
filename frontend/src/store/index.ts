import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux';

import { authReducer } from './authSlice';
import { diagramReducer } from './diagramSlice';
import { uiReducer } from './uiSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    diagram: diagramReducer,
    ui: uiReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch = (): AppDispatch => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
