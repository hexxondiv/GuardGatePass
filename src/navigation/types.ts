export type RootStackParamList = {
  Login: undefined;
  AccessDenied: undefined;
  GuardTabs: undefined;
};

export type GuardTabParamList = {
  /** Optional `code` query for deep links / testing (parity with web `?code=`). */
  Verification: { code?: string };
  InstantGuest: undefined;
  Settings: undefined;
};
