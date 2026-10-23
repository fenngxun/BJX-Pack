"""Batch 3j: monster-tower Fly gate patch.

BJX 0.4.3.3 extended the Monster Tower "Fly to safety" gate (then in
loc-street/events.twee) so animal-TF players can fly with bird/dragon
wings instead of the vanilla harpy requirement:

    <<if !$options.bjx_animal and ($harpy gte 6 and $birdFly gte 1) or
          $options.bjx_animal and (... bird.wings ... or dragon.wings ...)>>

0.5 moved the whole Monster Tower block to loc-monster-tower/main.twee
and changed the vanilla gate to `harpy gte 6 and birdFly gte 1 and
!$plucked` (plucked birds cannot fly). Merge strategy (project
convention: vanilla branch keeps 0.5 semantics, bjx branch keeps BJX
semantics):

    <<if !$options.bjx_animal and ($harpy gte 6 and $birdFly gte 1 and !$plucked) or
          $options.bjx_animal and ($transformationParts.bird.wings isnot "disabled" and $birdFly gte 1 or
                                   $transformationParts.dragon.wings isnot "disabled")>>

Everything else in the 0.5 file stays byte-identical (BJX's own
"Monster Tower Fly" passage is identical to 0.5's, verified line by
line; gen_street.py's 5-diff survey lists this gate as the only other
Monster Tower change).
"""

import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'refs', os.environ.get('DOL_REF', 'dol-0.5.10.12-target'), 'game',
                   'overworld-town', 'loc-monster-tower', 'main.twee')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   '_verify_monstertower')

OLD = '<<if $harpy gte 6 and $birdFly gte 1 and !$plucked>>'
NEW = ('<<if !$options.bjx_animal and ($harpy gte 6 and $birdFly gte 1 and !$plucked) or '
       '$options.bjx_animal and ($transformationParts.bird.wings isnot "disabled" and $birdFly gte 1 or '
       '$transformationParts.dragon.wings isnot "disabled")>>')


def main():
    with open(SRC, encoding='utf-8', newline='') as f:
        text = f.read()
    assert text.count(OLD) == 1, 'gate line count: %d' % text.count(OLD)
    patched = text.replace(OLD, NEW)
    # integrity: only the gate line changed
    assert len(patched.splitlines()) == len(text.splitlines())
    assert patched.count('transformationParts.dragon.wings') == 1
    os.makedirs(OUT, exist_ok=True)
    dst = os.path.join(OUT, 'bjx-monster-tower-hooks.twee')
    with open(dst, 'w', encoding='utf-8', newline='') as f:
        f.write(patched)
    print('bjx-monster-tower-hooks.twee: %d lines, gate patched' %
          len(patched.splitlines()))


if __name__ == '__main__':
    main()