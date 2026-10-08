export interface FollowView {
  scrollLeft: number;
  width: number;
  names: number;
}

export interface BarSpan {
  left: number;
  width: number;
}

/** Where to scroll the grid so that the bar that plays can be seen, turning a page to leave it just after the names; undefined while it can be seen. */
export const followScroll = ({ scrollLeft, width, names }: FollowView, bar: BarSpan): number | undefined => {
  const seen = bar.left >= scrollLeft + names && bar.left + bar.width <= scrollLeft + width;
  const target = Math.max(0, bar.left - names);
  return seen || target === scrollLeft ? undefined : target;
};
