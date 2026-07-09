// A minimal stand-in for System.Version, used by MimeMessage.MimeVersion.
//
// .NET's Version leaves Build/Revision at -1 when unset; ToString() only emits
// the components that are set and CompareTo() orders unset components lowest.
// This mirrors those two behaviors (the only ones MimeMessage relies on).
import type { MimeVersion } from './utils/mime-utils.js';

/**
 * Minimal representation of a .NET-style version.
 */
export class Version {
  /** The major version component. */
  readonly major: number;
  /** The minor version component. */
  readonly minor: number;
  /** The build component, or `-1` when unspecified. */
  readonly build: number;
  /** The revision component, or `-1` when unspecified. */
  readonly revision: number;

  /**
   * Initializes a new version.
   *
   * @param major The major version.
   * @param minor The minor version.
   * @param build The build component, or `-1` when unspecified.
   * @param revision The revision component, or `-1` when unspecified.
   */
  constructor(major: number, minor: number, build = -1, revision = -1) {
    if (!Number.isInteger(major) || major < 0) throw new RangeError('major must be a non-negative integer');
    if (!Number.isInteger(minor) || minor < 0) throw new RangeError('minor must be a non-negative integer');
    this.major = major;
    this.minor = minor;
    this.build = build;
    this.revision = revision;
  }

  /**
   * Creates a Version from a parsed MIME-Version value.
   *
   * @param value The parsed MIME version.
   * @returns The corresponding Version.
   */
  static fromMimeVersion(value: MimeVersion): Version {
    return new Version(value.major, value.minor, value.build ?? -1, value.revision ?? -1);
  }

  /**
   * Compares this version to another version.
   *
   * @param other The version to compare.
   * @returns `-1`, `0`, or `1` depending on ordering.
   */
  compareTo(other: Version): number {
    if (this.major !== other.major) return this.major > other.major ? 1 : -1;
    if (this.minor !== other.minor) return this.minor > other.minor ? 1 : -1;
    if (this.build !== other.build) return this.build > other.build ? 1 : -1;
    if (this.revision !== other.revision) return this.revision > other.revision ? 1 : -1;
    return 0;
  }

  /**
   * Formats this version.
   *
   * @returns The dotted version string.
   */
  toString(): string {
    if (this.build < 0) return `${this.major}.${this.minor}`;
    if (this.revision < 0) return `${this.major}.${this.minor}.${this.build}`;
    return `${this.major}.${this.minor}.${this.build}.${this.revision}`;
  }
}
