import type { Plugin } from "esbuild";

/** Peger `react`/`react-dom` på de globale UMD-builds fra cdnjs (window.React / window.ReactDOM). */
export const reactGlobals: Plugin = {
  name: "react-globals",
  setup(build) {
    const map: Record<string, string> = {
      react: "window.React",
      "react-dom": "window.ReactDOM",
      "react-dom/client": "window.ReactDOM",
    };
    build.onResolve({ filter: /^(react|react-dom|react-dom\/client)$/ }, (a) => ({ path: a.path, namespace: "react-global" }));
    build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: "jsx-runtime", namespace: "react-global" }));
    build.onLoad({ filter: /.*/, namespace: "react-global" }, (a) => {
      if (a.path === "jsx-runtime") {
        return {
          contents:
            "const R=window.React;function jsx(t,p,k){const{children,...rest}=p||{};return k!==undefined?R.createElement(t,{...rest,key:k},children):R.createElement(t,rest,children)}export{jsx,jsx as jsxs,jsx as jsxDEV};export const Fragment=R.Fragment;",
          loader: "js",
        };
      }
      return { contents: `module.exports = ${map[a.path]};`, loader: "js" };
    });
  },
};
