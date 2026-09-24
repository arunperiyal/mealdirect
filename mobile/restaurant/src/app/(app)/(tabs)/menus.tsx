import { useMemo } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  addDays,
  Button,
  colors,
  EmptyState,
  errorMessage,
  ErrorState,
  font,
  formatTime,
  LinkRow,
  LoadingState,
  localDateString,
  radius,
  spacing,
  type Menu,
} from '@mealdirect/shared';
import { dayLabel } from '@/lib/time';
import { useRestaurant } from '@/lib/useRestaurant';
import { useGetMenusQuery } from '@/store/serverApi';

const STATUS_TEXT: Record<Menu['status'], { label: string; color: string }> = {
  draft: { label: 'Draft', color: colors.warning },
  published: { label: 'Open for orders', color: colors.success },
  closed: { label: 'Closed', color: colors.textMuted },
  archived: { label: 'Archived', color: colors.textMuted },
};

export default function MenusScreen() {
  const restaurant = useRestaurant();
  const now = new Date();
  const today = localDateString(now);
  const range = useMemo(
    () => ({ from: localDateString(addDays(new Date(), -7)), to: localDateString(addDays(new Date(), 14)) }),
    []
  );
  const { data, error, isLoading, isFetching, refetch } = useGetMenusQuery({ restaurantId: restaurant.id, ...range });

  if (isLoading) return <LoadingState />;
  if (error && !data) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;

  const menus = data ?? [];
  const upcoming = menus.filter((m) => m.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const past = menus.filter((m) => m.date < today).sort((a, b) => b.date.localeCompare(a.date));
  const sections = [
    { title: 'Today and upcoming', data: upcoming },
    ...(past.length ? [{ title: 'Past week', data: past }] : []),
  ];

  return (
    <View style={styles.flex}>
      <SectionList
        sections={sections}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.brand} />
        }
        ListHeaderComponent={
          <LinkRow
            title="My dishes"
            detail="Add dishes once, then pick them for each menu"
            onPress={() => router.push('/dishes')}
          />
        }
        renderSectionHeader={({ section }) => <Text style={[font.heading, styles.section]}>{section.title}</Text>}
        renderSectionFooter={({ section }) =>
          section.data.length === 0 ? (
            <EmptyState title="No upcoming menus" message="Create one for today or tomorrow so customers can order." />
          ) : null
        }
        renderItem={({ item }) => <MenuRow menu={item} />}
      />
      <View style={styles.footer}>
        <Button title="New menu" onPress={() => router.push('/menu/new')} />
      </View>
    </View>
  );
}

function MenuRow({ menu }: { menu: Menu }) {
  const status = STATUS_TEXT[menu.status];
  const soldOut = menu.items.filter((i) => !i.available).length;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/menu/[id]', params: { id: menu.id } })}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.9 }]}
    >
      <View style={styles.rowTop}>
        <Text style={font.heading}>{dayLabel(menu.date)}</Text>
        <Text style={[styles.status, { color: status.color }]}>{status.label}</Text>
      </View>
      <Text style={font.caption}>
        {menu.items.length} {menu.items.length === 1 ? 'dish' : 'dishes'}
        {soldOut > 0 ? ` · ${soldOut} sold out` : ''}
        {menu.orderingStartTime && menu.orderingEndTime
          ? ` · orders ${formatTime(menu.orderingStartTime)}–${formatTime(menu.orderingEndTime)}`
          : ''}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: spacing.lg, paddingBottom: 100, flexGrow: 1 },
  section: { marginBottom: spacing.sm, marginTop: spacing.md },
  row: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, gap: 4 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  status: { fontSize: 13, fontWeight: '700' },
  footer: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg },
});
