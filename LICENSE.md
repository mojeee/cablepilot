# CablePilot License 1.0 (source-available)

Copyright (c) 2026 Mojtaba Amini ("Licensor"). All rights reserved except as granted below.

CablePilot is **source-available**: the source code is public so you can read it, learn from it, check what it does with your drawings, build it yourself and contribute. It is **not** "open source" in the OSI sense, because continued use after the evaluation period requires a paid license.

This license covers everything in this repository **except**:

- the library data in `library/` (symbols, parts, terminals, cables, frames, title blocks and macros as data files), licensed under Creative Commons Attribution 4.0 (see `library/LICENSE`), so anyone can reuse the data with credit;
- the font files in `shared/fonts/`, licensed under the SIL Open Font License 1.1 (see `shared/fonts/LICENSE.txt`).

Versions of CablePilot published before this license was adopted (up to and including commit `01271c2` on `main`) were released under the Apache License 2.0. Copies of those versions keep that license; this license applies from the next version on.

## 1. Definitions

- **Software**: the CablePilot desktop application in this repository, its source code, builds made from it, and its documentation, excluding `library/` and `shared/fonts/`.
- **You**: the person or organisation using the Software.
- **License Key**: a key issued by the Licensor (format `CP1-…`) that unlocks the Software after the evaluation period.
- **Your Drawings**: the projects, drawing sets, reports and exports you make with the Software.

## 2. What you may do

1. **Read, study and modify** the source code.
2. **Build** the Software from source for your own use under the terms below.
3. **Evaluate** the Software free of charge for **30 days** from its first start on each computer (the "Evaluation Period").
4. **Contribute** changes back to this repository (see section 7).
5. **Share links** to this repository and to official downloads.

## 3. What requires a paid License Key

Using the Software after the Evaluation Period, on any computer, requires a valid License Key for each user (personal plan) or each seat (commercial and education plans), obtained from the Licensor through the official website <https://cablepilot.agentflowbind.com>.

## 4. What you may not do

1. Remove, disable or work around the evaluation or license-key check, or distribute builds in which it is removed, disabled or bypassed.
2. Sell, rent, sublicense or redistribute the Software, modified or not, or offer it as a hosted service, except with the Licensor's written permission.
3. Generate, share or publish License Keys, or keys that imitate them.
4. Remove copyright, license or attribution notices.

Distributing unmodified copies of the official installers, free of charge and with this license, is allowed.

## 5. Your drawings

Your Drawings belong to you. The Licensor claims no rights in them, and they stay usable without the Software: projects are saved in an open, documented JSON format (`docs/file-format.md`), and drawing sets and lists are exported as PDF, DXF, CSV and XLSX. You may use, sell and distribute Your Drawings freely, also after the Evaluation Period and without a License Key.

## 6. Third-party components

The Software uses third-party libraries (for example Electron, React, three.js and pdf-lib), each under its own license, listed in `THIRD_PARTY_LICENSES.md`. Those licenses apply to those components and are not changed by this license.

## 7. Contributions

By submitting a contribution (for example a pull request), you confirm you have the right to do so and you grant the Licensor a perpetual, worldwide, royalty-free, irrevocable license to use, modify, relicense and distribute your contribution as part of the Software. A contribution to `library/` is, in addition, published under the CC BY 4.0 license of that folder.

## 8. No warranty

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NON-INFRINGEMENT. The Software helps you design electrical equipment; its checks and suggestions (cable sizing, protective devices, rule checks) state their assumptions and **do not replace the verification of a qualified engineer**. You are responsible for the equipment you build from Your Drawings.

## 9. Limitation of liability

TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL THE LICENSOR BE LIABLE FOR ANY CLAIM, DAMAGES (INCLUDING DAMAGE TO EQUIPMENT, INJURY ARISING FROM EQUIPMENT BUILT FROM YOUR DRAWINGS, OR LOSS OF DATA) OR OTHER LIABILITY, WHETHER IN CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR ITS USE. Nothing in this license limits rights you have under mandatory consumer-protection law in your country.

## 10. Termination

Your rights under this license end automatically if you break its terms. If you fix the breach within 30 days of becoming aware of it, your rights are reinstated.

## 11. Governing law

This license is governed by the laws of Italy, without regard to conflict-of-law rules, unless mandatory law where you live says otherwise.

---

Questions about licensing: open an issue at <https://github.com/mojeee/cablepilot/issues> with the label `license`.
