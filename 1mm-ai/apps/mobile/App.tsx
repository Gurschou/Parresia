import { StatusBar } from "expo-status-bar";
import { useMemo, useState } from "react";
import { ActivityIndicator, SafeAreaView, StyleSheet, View } from "react-native";
import { AuthProvider, useAuth } from "./src/auth/auth-context";
import { NavigationContext, type Route } from "./src/navigation";
import { AuthScreen } from "./src/screens/AuthScreen";
import { ChatScreen } from "./src/screens/ChatScreen";
import { ConversationsScreen } from "./src/screens/ConversationsScreen";
import { MemoriesScreen } from "./src/screens/MemoriesScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { theme } from "./src/theme";

function Root() {
  const { user, loading } = useAuth();
  const [stack, setStack] = useState<Route[]>([{ name: "conversations" }]);
  const route = stack[stack.length - 1] ?? { name: "conversations" as const };

  const navigator = useMemo(
    () => ({
      route,
      navigate: (next: Route) => setStack((prev) => [...prev, next]),
      back: () => setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev)),
    }),
    [route],
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.primary} size="large" />
      </View>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <NavigationContext.Provider value={navigator}>
      {route.name === "conversations" && <ConversationsScreen />}
      {route.name === "chat" && (
        <ChatScreen key={route.conversationId ?? "new"} conversationId={route.conversationId} />
      )}
      {route.name === "memories" && <MemoriesScreen />}
      {route.name === "settings" && <SettingsScreen />}
    </NavigationContext.Provider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SafeAreaView style={styles.app}>
        <StatusBar style="light" />
        <Root />
      </SafeAreaView>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  app: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.background,
  },
});
