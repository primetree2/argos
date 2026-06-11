"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light";

interface ThemeContextValue {
    theme: Theme;
    toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
    theme: "dark",
    toggle: () => { },
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setTheme] = useState<Theme>("dark");

    useEffect(() => {
        // Read persisted value on mount
        try {
            const stored = localStorage.getItem("argos-theme") as Theme | null;
            if (stored === "light" || stored === "dark") {
                setTheme(stored);
                document.documentElement.setAttribute("data-theme", stored);
            }
        } catch { }
    }, []);

    const toggle = () => {
        const next: Theme = theme === "dark" ? "light" : "dark";
        setTheme(next);
        try {
            localStorage.setItem("argos-theme", next);
        } catch { }
        if (next === "light") {
            document.documentElement.setAttribute("data-theme", "light");
        } else {
            document.documentElement.removeAttribute("data-theme");
        }
    };

    return (
        <ThemeContext.Provider value={{ theme, toggle }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    return useContext(ThemeContext);
}