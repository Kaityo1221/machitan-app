import { Stack } from 'expo-router';

import { EventSessionGate } from '../src/components/EventEntryGate';

export default function RootLayout() {
  return (
    <EventSessionGate>
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      />
    </EventSessionGate>
  );
}
