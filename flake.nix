{
  description = "Limor Automations – React/Vite web app";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
  };

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
      nodejs = pkgs.nodejs_22;
    in
    {
      packages.${system} = {
        default = pkgs.buildNpmPackage {
          pname = "limor-automations-web";
          version = "0.0.0";
          src = ./.;
          npmDepsHash = "sha256-+bD4yHnmaqqBEu8fbeLcHvgU63DDGcmyVRw9U3HaSrY=";
          nodejs = nodejs;
          buildPhase = ''
            npm -w apps/web run build
          '';
          installPhase = ''
            mkdir -p $out
            cp -r apps/web/dist/* $out/
          '';
        };
      };

      devShells.${system} = {
        default = pkgs.mkShell {
          buildInputs = [
            nodejs
          ];
        };
      };

      checks.${system} = {
        package-default = self.packages.${system}.default;
        devshell-default = self.devShells.${system}.default;
      };
    };
}
