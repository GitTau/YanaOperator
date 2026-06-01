import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  Nunito_500Medium,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  Nunito_900Black,
} from '@expo-google-fonts/nunito';
import { useAuthStore } from '../src/stores/authStore';
import { useStoreSelectionStore } from '../src/stores/storeSelectionStore';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30_000,
    },
  },
});

export default function RootLayout() {
  const { initialize, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const { loadPersistedStore, selectedStore, isLoaded: storeLoaded } = useStoreSelectionStore();

  const [fontsLoaded] = useFonts({
    'Nunito-Medium': Nunito_500Medium,
    'Nunito-Bold': Nunito_700Bold,
    'Nunito-ExtraBold': Nunito_800ExtraBold,
    'Nunito-Black': Nunito_900Black,
  });

  useEffect(() => {
    initialize();
    loadPersistedStore();
  }, []);

  useEffect(() => {
    if (!authLoading && storeLoaded && fontsLoaded) {
      SplashScreen.hideAsync();
      if (!isAuthenticated) {
        router.replace('/(auth)/login');
      } else if (!selectedStore) {
        router.replace('/(auth)/store-select');
      } else {
        router.replace('/(app)');
      }
    }
  }, [isAuthenticated, authLoading, selectedStore, storeLoaded, fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(app)" />
          </Stack>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

