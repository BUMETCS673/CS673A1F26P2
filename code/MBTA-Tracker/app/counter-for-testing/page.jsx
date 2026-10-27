"use client";

import { useState } from "react";

export default function Home() {
    const [count, setCount] = useState(0);

    return (
        <main>
            <h1>React is working</h1>
            <p>Count: {count}</p>

            <button onClick={() => setCount(count + 1)}>
                Click me
            </button>
        </main>
    );
}