import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

export type PrototypeEvent = {
  id: string;
  primaryCode: string;
  joinCodes: string[];
  name: string;
  venue: string;
  dateLabel: string;
  timeLabel: string;
  description: string;
};

type EventEntryGateProps = {
  onJoin: (event: PrototypeEvent) => void;
};

type EventSessionContextValue = {
  activeEvent: PrototypeEvent;
  leaveEvent: () => void;
};

const EventSessionContext =
  createContext<EventSessionContextValue | null>(null);

export function useEventSession() {
  const value = useContext(EventSessionContext);

  if (!value) {
    throw new Error(
      'useEventSession must be used inside EventSessionGate.',
    );
  }

  return value;
}

export function EventSessionGate({
  children,
}: {
  children: ReactNode;
}) {
  const [activeEvent, setActiveEvent] =
    useState<PrototypeEvent | null>(null);

  if (!activeEvent) {
    return <EventEntryGate onJoin={setActiveEvent} />;
  }

  return (
    <EventSessionContext.Provider
      value={{
        activeEvent,
        leaveEvent: () => setActiveEvent(null),
      }}
    >
      {children}
    </EventSessionContext.Provider>
  );
}

const PROTOTYPE_EVENTS: PrototypeEvent[] = [
  {
    id: 'kasai-rinkai-prototype',
    primaryCode: 'KASAI',
    joinCodes: ['KASAI', 'PGCTOKYO'],
    name: '葛西臨海公園 まちたん！テスト',
    venue: '葛西臨海公園',
    dateLabel: 'イベント当日',
    timeLabel: '開催時間内のみ有効',
    description:
      'イベントに参加して、会場のポイポイをみんなで探します。',
  },
];

function normalizeJoinCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function findPrototypeEvent(code: string) {
  const normalizedCode = normalizeJoinCode(code);

  return (
    PROTOTYPE_EVENTS.find((event) =>
      event.joinCodes.some(
        (joinCode) =>
          normalizeJoinCode(joinCode) === normalizedCode,
      ),
    ) ?? null
  );
}

export function EventEntryGate({
  onJoin,
}: EventEntryGateProps) {
  const [joinCode, setJoinCode] = useState('');
  const [selectedEvent, setSelectedEvent] =
    useState<PrototypeEvent | null>(null);
  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  const canSearch = useMemo(
    () => normalizeJoinCode(joinCode).length > 0,
    [joinCode],
  );

  const handleFindEvent = () => {
    const event = findPrototypeEvent(joinCode);

    if (!event) {
      setSelectedEvent(null);
      setErrorMessage(
        'イベントが見つかりません。コードを確認してください。',
      );
      return;
    }

    setErrorMessage(null);
    setSelectedEvent(event);
  };

  const handleChangeCode = (value: string) => {
    setJoinCode(value);

    if (errorMessage) {
      setErrorMessage(null);
    }
  };

  if (selectedEvent) {
    return (
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brandBlock}>
          <Text style={styles.logo}>まちたん！</Text>
          <Text style={styles.subtitle}>
            このイベントで間違いないですか？
          </Text>
        </View>

        <View style={styles.confirmCard}>
          <View style={styles.statusPill}>
            <Text style={styles.statusPillText}>
              イベント確認
            </Text>
          </View>

          <Text style={styles.eventName}>
            {selectedEvent.name}
          </Text>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>会場</Text>
            <Text style={styles.detailValue}>
              {selectedEvent.venue}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>日付</Text>
            <Text style={styles.detailValue}>
              {selectedEvent.dateLabel}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>時間</Text>
            <Text style={styles.detailValue}>
              {selectedEvent.timeLabel}
            </Text>
          </View>

          <View style={styles.codePanel}>
            <Text style={styles.codePanelLabel}>
              イベントコード
            </Text>
            <Text style={styles.codePanelValue}>
              {selectedEvent.primaryCode}
            </Text>
          </View>

          <Text style={styles.description}>
            {selectedEvent.description}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => onJoin(selectedEvent)}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.primaryButtonText}>
            このイベントに参加する
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setSelectedEvent(null);
            setErrorMessage(null);
          }}
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.secondaryButtonText}>
            コードを入力し直す
          </Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brandBlock}>
          <Text style={styles.logo}>まちたん！</Text>
          <Text style={styles.subtitle}>
            今日のまちへ、歩き出そう
          </Text>
        </View>

        <View style={styles.entryCard}>
          <Text style={styles.entryTitle}>
            イベントに参加
          </Text>

          <Text style={styles.entryDescription}>
            主催者から案内されたイベントコード、またはグループコードを入力してください。
          </Text>

          <Text style={styles.inputLabel}>
            イベントコード
          </Text>

          <TextInput
            accessibilityLabel="イベントコード"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={24}
            onChangeText={handleChangeCode}
            onSubmitEditing={handleFindEvent}
            placeholder="例：KASAI"
            placeholderTextColor="#929A91"
            returnKeyType="search"
            style={[
              styles.input,
              errorMessage && styles.inputError,
            ]}
            value={joinCode}
          />

          {errorMessage ? (
            <Text style={styles.errorText}>
              {errorMessage}
            </Text>
          ) : (
            <Text style={styles.helpText}>
              テスト用コード：KASAI
            </Text>
          )}

          <Pressable
            accessibilityRole="button"
            disabled={!canSearch}
            onPress={handleFindEvent}
            style={({ pressed }) => [
              styles.primaryButton,
              !canSearch && styles.buttonDisabled,
              pressed && canSearch && styles.buttonPressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>
              イベントを探す
            </Text>
          </Pressable>
        </View>

        <View style={styles.noteCard}>
          <Text style={styles.noteTitle}>
            イベント当日だけ遊べます
          </Text>
          <Text style={styles.noteText}>
            正式版では、イベントに登録された地図と開催時間が自動で反映されます。
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F7F8F2',
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingTop: 42,
    paddingBottom: 42,
  },
  brandBlock: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logo: {
    fontSize: 40,
    fontWeight: '800',
    color: '#243325',
  },
  subtitle: {
    marginTop: 7,
    fontSize: 15,
    color: '#5B675C',
  },
  entryCard: {
    padding: 20,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
  },
  entryTitle: {
    fontSize: 23,
    fontWeight: '800',
    color: '#243325',
  },
  entryDescription: {
    marginTop: 9,
    fontSize: 14,
    lineHeight: 21,
    color: '#5B675C',
  },
  inputLabel: {
    marginTop: 22,
    marginBottom: 7,
    fontSize: 13,
    fontWeight: '700',
    color: '#375F3A',
  },
  input: {
    height: 56,
    paddingHorizontal: 16,
    borderWidth: 2,
    borderColor: '#D8DFD5',
    borderRadius: 16,
    backgroundColor: '#FAFBF7',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: '#243325',
  },
  inputError: {
    borderColor: '#B8574F',
  },
  helpText: {
    marginTop: 8,
    fontSize: 12,
    color: '#697169',
  },
  errorText: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '700',
    color: '#A1453E',
  },
  primaryButton: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    paddingHorizontal: 18,
    borderRadius: 17,
    backgroundColor: '#375F3A',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  secondaryButton: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingHorizontal: 18,
    borderWidth: 2,
    borderColor: '#375F3A',
    borderRadius: 17,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#375F3A',
  },
  buttonPressed: {
    opacity: 0.76,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  noteCard: {
    marginTop: 14,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#EAF0E6',
  },
  noteTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#375F3A',
  },
  noteText: {
    marginTop: 5,
    fontSize: 12,
    lineHeight: 18,
    color: '#5B675C',
  },
  confirmCard: {
    padding: 20,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
  },
  statusPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#E2EBDD',
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#375F3A',
  },
  eventName: {
    marginTop: 14,
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '800',
    color: '#243325',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 14,
  },
  detailLabel: {
    width: 52,
    fontSize: 13,
    fontWeight: '700',
    color: '#697169',
  },
  detailValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#243325',
  },
  codePanel: {
    marginTop: 18,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#F0F4ED',
  },
  codePanelLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#697169',
  },
  codePanelValue: {
    marginTop: 4,
    fontSize: 23,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: '#375F3A',
  },
  description: {
    marginTop: 16,
    fontSize: 13,
    lineHeight: 20,
    color: '#5B675C',
  },
});
