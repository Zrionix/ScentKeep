import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottleTile } from '@/components/BottleTile';
import { Card } from '@/components/ui/Card';
import { EmptyState, PageHeader } from '@/components/ui/Screen';
import { Tag, TagRow } from '@/components/ui/Tag';
import { Text } from '@/components/ui/Text';
import { wardrobeCap, wishlistCap } from '@/domain/entitlements';
import { hasLoggedToday } from '@/domain/sotd';
import { ownedBottles, wishlistBottles } from '@/domain/stats';
import { WISHLIST_KIND_LABELS, WISHLIST_KINDS, type WishlistKind } from '@/domain/types';
import { applyFilter, distinctFamilies, EMPTY_FILTER, isFilterActive, SORT_LABELS, type SortKey } from '@/domain/wardrobe';
import { analytics } from '@/lib/analytics';
import { useStore } from '@/state/store';
import { radius, space, type as typeScale } from '@/theme';
import { useTheme } from '@/theme/ThemeProvider';

type Shelf = 'wardrobe' | 'wishlist';

export default function WardrobeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const fragrances = useStore((s) => s.fragrances);
  const sotd = useStore((s) => s.sotd);
  const isPremium = useStore((s) => s.isPremium);

  const [shelf, setShelf] = useState<Shelf>('wardrobe');
  const [wishKind, setWishKind] = useState<WishlistKind>('buy');
  const [filter, setFilter] = useState({ ...EMPTY_FILTER });
  const [showSort, setShowSort] = useState(false);

  const owned = useMemo(() => ownedBottles(fragrances), [fragrances]);
  const wishlist = useMemo(() => wishlistBottles(fragrances), [fragrances]);
  // Collectors keep "to buy" and "to try" as separate lists; the cap is on the
  // combined total, so both counts still matter for the banner.
  const wishOfKind = useMemo(
    () => wishlist.filter((f) => f.wishlistKind === wishKind),
    [wishlist, wishKind],
  );
  const source = shelf === 'wardrobe' ? owned : wishOfKind;
  const visible = useMemo(() => applyFilter(source, filter), [source, filter]);
  const families = useMemo(() => distinctFamilies(source), [source]);

  const cap = shelf === 'wardrobe' ? wardrobeCap(owned.length, isPremium) : wishlistCap(wishlist.length, isPremium);
  const loggedToday = hasLoggedToday(sotd);

  // Two columns with a consistent gutter, derived from the real screen width so
  // the grid stays balanced on everything from an SE to a Pro Max.
  const gutter = space.md;
  const tileWidth = (width - space.lg * 2 - gutter) / 2;

  const openAdd = () => {
    if (cap.atLimit) {
      analytics().capture('free_cap_hit', { cap: shelf === 'wardrobe' ? 'wardrobe' : 'wishlist' });
      router.push({ pathname: '/paywall', params: { source: `cap-${shelf}` } });
      return;
    }
    router.push({
      pathname: '/bottle/new',
      params: { wishlist: shelf === 'wishlist' ? '1' : '0', kind: wishKind },
    });
  };

  return (
    <View style={[styles.fill, { backgroundColor: colors.bg }]}>
      <FlatList
        data={visible}
        keyExtractor={(f) => f.id}
        numColumns={2}
        columnWrapperStyle={{ gap: gutter }}
        contentContainerStyle={{
          paddingTop: insets.top + space.sm,
          paddingBottom: insets.bottom + 120,
          paddingHorizontal: space.lg,
          // Applies between the header block and every grid row, so it doubles
          // as the row gutter. space.xl left a visible hole under the filters.
          gap: space.lg,
        }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            <PageHeader
              eyebrow="ScentKeep"
              title={shelf === 'wardrobe' ? 'My Wardrobe' : 'Wishlist'}
              subtitle={
                shelf === 'wardrobe'
                  ? `${owned.length} ${owned.length === 1 ? 'bottle' : 'bottles'} on the shelf`
                  : `${wishlist.length} ${wishlist.length === 1 ? 'bottle' : 'bottles'} you are hunting`
              }
            />

            {shelf === 'wardrobe' && owned.length > 0 ? (
              <SotdPrompt
                loggedToday={loggedToday}
                onPress={() => router.push({ pathname: '/log-sotd', params: { from: 'home' } })}
              />
            ) : null}

            <ShelfSwitch shelf={shelf} owned={owned.length} wishlist={wishlist.length} onChange={setShelf} />

            {shelf === 'wishlist' ? (
              <View style={styles.kindRow}>
                <TagRow>
                  {WISHLIST_KINDS.map((k) => (
                    <Tag
                      key={k}
                      label={`${WISHLIST_KIND_LABELS[k]} · ${
                        wishlist.filter((f) => f.wishlistKind === k).length
                      }`}
                      selected={wishKind === k}
                      testID={`wishkind-${k}`}
                      onPress={() => setWishKind(k)}
                    />
                  ))}
                </TagRow>
              </View>
            ) : null}

            {source.length > 0 ? (
              <>
                <View style={[styles.search, { backgroundColor: colors.surface2, borderColor: colors.line }]}>
                  <Text tone="faint" style={styles.searchGlyph}>
                    ⌕
                  </Text>
                  <TextInput
                    testID="wardrobe-search"
                    value={filter.query}
                    onChangeText={(query) => setFilter((f) => ({ ...f, query }))}
                    placeholder="Search name, house or notes"
                    placeholderTextColor={colors.ink4}
                    accessibilityLabel="Search your collection"
                    returnKeyType="search"
                    style={[typeScale.body, styles.searchInput, { color: colors.ink }]}
                  />
                  {filter.query ? (
                    <Pressable
                      onPress={() => setFilter((f) => ({ ...f, query: '' }))}
                      accessibilityRole="button"
                      accessibilityLabel="Clear search"
                      hitSlop={10}
                    >
                      <Text tone="tertiary">✕</Text>
                    </Pressable>
                  ) : null}
                </View>

                {/* Horizontal rather than wrapping: a dozen families wrapped to
                    three rows and pushed the actual grid below the fold. */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.filterRow}
                  style={styles.filterScroll}
                >
                  {families.map((fam) => (
                    <Tag
                      key={fam}
                      label={fam}
                      family
                      selected={filter.families.includes(fam)}
                      testID={`filter-family-${fam}`}
                      onPress={() =>
                        setFilter((f) => ({
                          ...f,
                          families: f.families.includes(fam)
                            ? f.families.filter((x) => x !== fam)
                            : [...f.families, fam],
                        }))
                      }
                    />
                  ))}
                </ScrollView>

                <View style={styles.sortRow}>
                  <Pressable
                    onPress={() => setShowSort((v) => !v)}
                    accessibilityRole="button"
                    accessibilityLabel={`Sort by ${SORT_LABELS[filter.sort]}. Tap to change.`}
                  >
                    <Text variant="caption" tone="accent">
                      ↑↓ {SORT_LABELS[filter.sort]}
                    </Text>
                  </Pressable>
                  {isFilterActive(filter) ? (
                    <Pressable
                      onPress={() => setFilter({ ...EMPTY_FILTER })}
                      accessibilityRole="button"
                      accessibilityLabel="Clear all filters"
                    >
                      <Text variant="caption" tone="tertiary">
                        Clear filters
                      </Text>
                    </Pressable>
                  ) : null}
                </View>

                {showSort ? (
                  <Card flat style={styles.sortSheet}>
                    {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                      <Pressable
                        key={key}
                        onPress={() => {
                          setFilter((f) => ({ ...f, sort: key }));
                          setShowSort(false);
                        }}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: filter.sort === key }}
                        style={styles.sortOption}
                      >
                        <Text variant="small" tone={filter.sort === key ? 'accent' : 'secondary'}>
                          {SORT_LABELS[key]}
                        </Text>
                        {filter.sort === key ? <Text tone="accent">✓</Text> : null}
                      </Pressable>
                    ))}
                  </Card>
                ) : null}
              </>
            ) : null}

            {cap.atLimit ? (
              <CapBanner
                shelf={shelf}
                limit={cap.limit ?? 0}
                onPress={() => {
                  analytics().capture('free_cap_hit', { cap: shelf === 'wardrobe' ? 'wardrobe' : 'wishlist' });
                  router.push({ pathname: '/paywall', params: { source: `cap-banner-${shelf}` } });
                }}
              />
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <BottleTile
            fragrance={item}
            width={tileWidth}
            testID={`bottle-${item.id}`}
            onPress={() => router.push({ pathname: '/bottle/[id]', params: { id: item.id } })}
          />
        )}
        ListEmptyComponent={
          source.length === 0 ? (
            <EmptyState
              testID="wardrobe-empty"
              glyph={shelf === 'wardrobe' ? '❖' : '✦'}
              title={shelf === 'wardrobe' ? 'Your shelf is empty' : 'Nothing on the wishlist'}
              body={
                shelf === 'wardrobe'
                  ? 'Add the first bottle you own and your wardrobe starts here.'
                  : 'Track the bottles you are hunting, then move them across when you buy.'
              }
              actionLabel={shelf === 'wardrobe' ? 'Add your first bottle' : 'Add a wish'}
              onAction={openAdd}
            />
          ) : (
            <EmptyState
              testID="wardrobe-no-results"
              glyph="⌕"
              title="Nothing matches"
              body="Try a different search, or clear the filters to see everything again."
              actionLabel="Clear filters"
              onAction={() => setFilter({ ...EMPTY_FILTER })}
            />
          )
        }
      />

      {/* A compact circular action rather than a wide pill: a full-width FAB
          sat squarely on top of the bottle names in the last visible row. */}
      <Pressable
        testID="add-bottle-fab"
        onPress={openAdd}
        accessibilityRole="button"
        accessibilityLabel={shelf === 'wardrobe' ? 'Add a bottle' : 'Add to wishlist'}
        style={({ pressed }) => [
          styles.fab,
          {
            backgroundColor: colors.accent,
            bottom: insets.bottom + space.xl,
            opacity: pressed ? 0.85 : 1,
            shadowColor: colors.shadow,
          },
        ]}
      >
        <Text style={styles.fabGlyph} tone="onAccent">
          +
        </Text>
      </Pressable>
    </View>
  );
}

function SotdPrompt({ loggedToday, onPress }: { loggedToday: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Card
      onPress={onPress}
      testID="sotd-prompt"
      accessibilityLabel={
        loggedToday ? 'Scent of the day logged. Tap to add another.' : 'Log your scent of the day'
      }
      style={[styles.sotdCard, { borderColor: loggedToday ? colors.line : colors.accentLine }]}
    >
      <View style={styles.sotdRow}>
        <View style={styles.fill}>
          <Text variant="overline" tone={loggedToday ? 'tertiary' : 'accent'}>
            {loggedToday ? 'Logged today' : 'Scent of the Day'}
          </Text>
          <Text variant="subtitle" style={styles.sotdTitle}>
            {loggedToday ? 'Wearing something else too?' : 'What are you wearing today?'}
          </Text>
        </View>
        <View style={[styles.sotdChevron, { backgroundColor: loggedToday ? colors.surface2 : colors.accent }]}>
          <Text tone={loggedToday ? 'tertiary' : 'onAccent'} style={styles.sotdChevronText}>
            {loggedToday ? '+' : '›'}
          </Text>
        </View>
      </View>
    </Card>
  );
}

function ShelfSwitch({
  shelf,
  owned,
  wishlist,
  onChange,
}: {
  shelf: Shelf;
  owned: number;
  wishlist: number;
  onChange: (s: Shelf) => void;
}) {
  const { colors } = useTheme();
  const options: { key: Shelf; label: string; count: number }[] = [
    { key: 'wardrobe', label: 'Wardrobe', count: owned },
    { key: 'wishlist', label: 'Wishlist', count: wishlist },
  ];

  return (
    <View style={[styles.switch, { backgroundColor: colors.surface2, borderColor: colors.line }]}>
      {options.map((o) => {
        const active = shelf === o.key;
        return (
          <Pressable
            key={o.key}
            testID={`shelf-${o.key}`}
            onPress={() => onChange(o.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${o.label}, ${o.count} bottles`}
            style={[styles.switchItem, active ? { backgroundColor: colors.surface } : null]}
          >
            <Text variant="small" tone={active ? 'default' : 'tertiary'}>
              {o.label}
            </Text>
            <Text variant="caption" tone={active ? 'accent' : 'faint'}>
              {o.count}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function CapBanner({ shelf, limit, onPress }: { shelf: Shelf; limit: number; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Card
      onPress={onPress}
      testID="cap-banner"
      flat
      style={[styles.capBanner, { borderColor: colors.accentLine, backgroundColor: colors.accentBg }]}
      accessibilityLabel={`Free limit reached: ${limit} ${shelf === 'wardrobe' ? 'bottles' : 'wishes'}. Tap to see Premium.`}
    >
      <Text variant="overline" tone="accent">
        Free limit reached
      </Text>
      <Text variant="small" tone="secondary" style={styles.capBody}>
        {shelf === 'wardrobe'
          ? `Free keeps ${limit} bottles. Premium makes your wardrobe unlimited — nothing you've already added is affected.`
          : `Free keeps ${limit} wishes. Premium removes the limit.`}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  sotdCard: { marginBottom: space.lg, borderWidth: 1 },
  sotdRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  sotdTitle: { marginTop: 4 },
  sotdChevron: { width: 38, height: 38, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  sotdChevronText: { fontSize: 20, lineHeight: 24 },
  switch: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: space.lg,
  },
  switchItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    height: 46,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: space.md,
  },
  searchGlyph: { fontSize: 17 },
  searchInput: { flex: 1, paddingVertical: 0 },
  kindRow: { marginBottom: space.lg },
  filterRow: { gap: space.sm, paddingRight: space.lg },
  filterScroll: { marginBottom: space.md, marginHorizontal: -space.lg, paddingHorizontal: space.lg },
  sortRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sortSheet: { marginBottom: space.lg, paddingVertical: space.sm },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
  },
  capBanner: { marginBottom: space.lg, borderWidth: 1 },
  capBody: { marginTop: 6 },
  fab: {
    position: 'absolute',
    right: space.lg,
    width: 58,
    height: 58,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  fabGlyph: { fontSize: 30, lineHeight: 34, fontWeight: '300' },
});
