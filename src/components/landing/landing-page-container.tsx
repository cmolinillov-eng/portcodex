"use client";

import React, { useState } from "react";
import { LandingHero } from "./landing-hero";
import { AuthPanel, type AuthPanelView } from "./auth-panel";

export function LandingPageContainer() {
  const [authView, setAuthView] = useState<AuthPanelView>(null);

  return (
    <>
      <LandingHero
        onLoginClick={() => setAuthView("login")}
      />
      <AuthPanel
        view={authView}
        onClose={() => setAuthView(null)}
        onChangeView={setAuthView}
      />
    </>
  );
}
