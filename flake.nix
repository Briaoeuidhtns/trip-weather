{
  description = "Route weather React SPA";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in
    {
      packages = forAllSystems (system:
        let
          pkgs = import nixpkgs { inherit system; };
          lib = pkgs.lib;
          appSrc = lib.fileset.toSource {
            root = ./.;
            fileset = lib.fileset.unions [
              ./index.html
              ./package.json
              ./pnpm-lock.yaml
              ./src
              ./tsconfig.app.json
              ./tsconfig.json
              ./vite.config.ts
            ];
          };
          pnpmConfigHook10 = pkgs.pnpmConfigHook.overrideAttrs (prevAttrs: {
            propagatedBuildInputs = (prevAttrs.propagatedBuildInputs or [ ]) ++ [ pkgs.pnpm_10 ];
          });
          bundle = pkgs.stdenvNoCC.mkDerivation (finalAttrs: {
            pname = "route-weather";
            version = "0.1.0";
            src = appSrc;

            nativeBuildInputs = [
              pkgs.nodejs_22
              pnpmConfigHook10
            ];

            pnpmDeps = pkgs.fetchPnpmDeps {
              inherit (finalAttrs) pname version src;
              fetcherVersion = 3;
              pnpm = pkgs.pnpm_10;
              hash = "sha256-VJzrOHUmWmLhBl8jxWbZsXK9M0JzN9Gxj7VMmNUsUZ0=";
            };

            buildPhase = ''
              runHook preBuild
              pnpm build
              runHook postBuild
            '';

            installPhase = ''
              runHook preInstall
              cp -r dist $out
              runHook postInstall
            '';
          });
        in
        {
          inherit bundle;
          default = bundle;
        });

      devShells = forAllSystems (system:
        let
          pkgs = import nixpkgs { inherit system; };
        in
        {
          default = pkgs.mkShell {
            packages = with pkgs; [
              nodejs_22
              pnpm
              pkg-config
              python3
            ];

            shellHook = ''
              export PNPM_HOME="$PWD/.pnpm-home"
              export PATH="$PNPM_HOME:$PATH"
            '';
          };
        });
    };
}
