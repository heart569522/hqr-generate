<template>
  <div style="font-family: ui-monospace, monospace; padding: 2rem">
    <nav style="display: flex; gap: 1rem; margin-bottom: 1.5rem">
      <NuxtLink to="/">client</NuxtLink>
      <NuxtLink to="/ssr">ssr</NuxtLink>
      <NuxtLink to="/scan">scan</NuxtLink>
      <NuxtLink to="/barcode">barcode</NuxtLink>
      <a href="/api/qr?text=nitro">api</a>
    </nav>
    <NuxtPage />
  </div>
</template>
