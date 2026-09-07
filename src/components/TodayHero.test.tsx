import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { EmptyTodayHero, TodayHero, todayHeroKind } from '@/components/TodayHero';
import { makeEntry, makeFragrance } from '@/domain/fixtures';

describe('todayHeroKind', () => {
  it('is empty when the wardrobe has 0 bottles, even if a log exists', () => {
    expect(todayHeroKind(0, false)).toBe('empty');
    expect(todayHeroKind(0, true)).toBe('empty');
  });

  it('keeps the populated Today states once a bottle exists', () => {
    expect(todayHeroKind(1, false)).toBe('prompt');
    expect(todayHeroKind(3, true)).toBe('logged');
  });
});

describe('EmptyTodayHero', () => {
  it('offers one primary tap to add a bottle and hides Wear this / SOTD / share', async () => {
    const onAdd = jest.fn();
    const view = await render(<EmptyTodayHero onAddBottle={onAdd} />);

    expect(view.getByTestId('today-empty')).toBeTruthy();
    expect(view.getByText('Add a bottle to start Today')).toBeTruthy();
    expect(view.getByText(/Nothing is added for you/)).toBeTruthy();
    expect(view.queryByTestId('sotd-prompt')).toBeNull();
    expect(view.queryByTestId('sotd-logged')).toBeNull();
    expect(view.queryByTestId('sotd-share')).toBeNull();
    expect(view.queryByText('What are you wearing today?')).toBeNull();
    expect(view.queryByText('Wear this')).toBeNull();
    expect(view.queryByText("Today's pick")).toBeNull();
    expect(view.queryByText("Share today's scent")).toBeNull();
    expect(view.queryByTestId('today-empty-wishlist')).toBeNull();

    await fireEvent.press(view.getByTestId('today-empty-add'));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('offers add from wishlist only when a wishlist already exists', async () => {
    const onAdd = jest.fn();
    const onWish = jest.fn();
    const view = await render(
      <EmptyTodayHero onAddBottle={onAdd} wishlistCount={2} onAddFromWishlist={onWish} />,
    );

    await fireEvent.press(view.getByTestId('today-empty-wishlist'));
    expect(onWish).toHaveBeenCalledTimes(1);
    expect(onAdd).not.toHaveBeenCalled();
    expect(view.queryByText(/tutorial/i)).toBeNull();
  });
});

describe('TodayHero populated', () => {
  const bottle = makeFragrance({ id: 'b1', name: 'Sauvage', brand: 'Dior' });

  it('shows the SOTD prompt when there is something to wear and today is unlogged', async () => {
    const onLog = jest.fn();
    const view = await render(
      <TodayHero
        loggedToday={false}
        wears={[]}
        onLogPress={onLog}
        onOpenBottle={jest.fn()}
        onShare={jest.fn()}
      />,
    );

    expect(view.getByTestId('sotd-prompt')).toBeTruthy();
    expect(view.getByText('What are you wearing today?')).toBeTruthy();
    expect(view.queryByTestId('today-empty')).toBeNull();
    expect(view.queryByTestId('sotd-share')).toBeNull();
    await fireEvent.press(view.getByTestId('sotd-prompt'));
    expect(onLog).toHaveBeenCalledTimes(1);
  });

  it('shows wearing today and share after a log, never the empty first-open card', async () => {
    const onShare = jest.fn();
    const view = await render(
      <TodayHero
        loggedToday
        wears={[{ entry: makeEntry({ id: 'e1', fragranceId: 'b1', date: '2026-09-02' }), fragrance: bottle }]}
        onLogPress={jest.fn()}
        onOpenBottle={jest.fn()}
        onShare={onShare}
      />,
    );

    expect(view.getByTestId('sotd-logged')).toBeTruthy();
    expect(view.getByText('Sauvage')).toBeTruthy();
    expect(view.getByTestId('sotd-share')).toBeTruthy();
    expect(view.getByText("Share today's scent")).toBeTruthy();
    expect(view.queryByTestId('today-empty')).toBeNull();
    expect(view.queryByText('Add a bottle to start Today')).toBeNull();
    await fireEvent.press(view.getByTestId('sotd-share'));
    expect(onShare).toHaveBeenCalledWith('b1');
  });
});
