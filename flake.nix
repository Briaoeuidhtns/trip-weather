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
