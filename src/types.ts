/** A single stop on a guided code tour. */
export interface TourStop {
  /** File path, absolute or relative to the codebase root. */
  file: string;
  /** 1-based line the editor should land on. */
  line: number;
  /** Optional last line of a range to highlight. */
  endLine?: number;
  /** Short label shown in the list (e.g. "entry point", "the reducer"). */
  label: string;
  /** Longer explanation of what to look at here and why it matters. */
  detail: string;
}

/** A guided tour: an ordered set of stops with an overall framing. */
export interface Tour {
  /** Title of the whole tour (what question it answers). */
  title: string;
  /** Optional one-paragraph overview shown above the list. */
  overview?: string;
  stops: TourStop[];
}
