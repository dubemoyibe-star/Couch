"use client";

import { useSyncExternalStore } from "react";
import { greetingFor } from "@/lib/greeting";

const subscribe = () => () => {};
// The server does not know the visitor's timezone, so it renders a neutral
// greeting and the browser swaps in the time-of-day one after hydration.
const serverGreeting = () => "Welcome back";
const clientGreeting = () => greetingFor(new Date().getHours());

export function Greeting({ name }: { readonly name: string }) {
  const greeting = useSyncExternalStore(subscribe, clientGreeting, serverGreeting);
  return (
    <>
      {greeting}, {name}.
    </>
  );
}
