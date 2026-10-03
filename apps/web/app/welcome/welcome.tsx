import { Link } from 'react-router';
import type { ReactNode } from 'react';
import { Header } from './header';
import { WordCycle } from './word-cycle';
import { GITHUB_URL, X_URL } from './env';
import { Footer } from './footer';
import { XLogo } from './x-logo';

function HomepageSection(props: { children: ReactNode }): ReactNode {
  return <div className='section'>{props.children}</div>;
}

function HomepageSectionTitle(props: { children: ReactNode }): ReactNode {
  return <h2 className='section-title'>{props.children}</h2>;
}

function HeadingShapesOverlay1(): ReactNode {
  return (
    <div className='shapes' aria-hidden='true'>
      <div
        className='shape shape-absolute'
        style={{ top: '-1.25rem', left: '1.25rem', background: '#ffeb92', opacity: 0.65 }}
      />
      <div
        className='shape shape-absolute'
        style={{ top: 0, left: 0, background: '#92ffeb', opacity: 0.65 }}
      />
    </div>
  );
}

function HeadingShapesOverlay2(): ReactNode {
  return (
    <div className='shapes' aria-hidden='true'>
      <div className='shape shape-wedge' style={{ background: '#54ff71', opacity: 0.55 }} />
    </div>
  );
}

function HeadingShapesOverlay3(): ReactNode {
  return (
    <div className='shapes' aria-hidden='true'>
      <div
        className='shape shape-absolute shape-triangle'
        style={{ background: '#6154ff', opacity: 0.55 }}
      />
      <div
        className='shape shape-absolute'
        style={{ top: 0, left: 0, background: '#fcff92', opacity: 0.65 }}
      />
    </div>
  );
}

function HeadingShapesOverlay4(): ReactNode {
  return (
    <div className='shapes shapes-centered' aria-hidden='true'>
      <div className='shape shape-circle' style={{ background: '#ffc254', opacity: 0.35 }} />
      <div
        className='shape shape-absolute shape-circle'
        style={{ top: 0, left: 75, background: '#54ffca', opacity: 0.35 }}
      />
    </div>
  );
}

function Item(props: { question: string; children: ReactNode }) {
  return (
    <li className='faq-item'>
      <details>
        <summary>
          <span className='faq-toggle' /> <span className='faq-question'>{props.question}</span>
        </summary>
        <div className='faq-answer stack'>{props.children}</div>
      </details>
    </li>
  );
}

function OutcomePill(props: { color: string; children: ReactNode }) {
  return (
    <div className='pill'>
      <span className='pill-dot' style={{ background: props.color }} />
      {props.children}
    </div>
  );
}

function FollowButton() {
  return (
    <Link to={X_URL} className='button'>
      <XLogo size={16} />
      Follow on X
    </Link>
  );
}

export function Welcome() {
  return (
    <div>
      <Header />
      <div className='page'>
        <div className='hero'>
          <div className='hero-content'>
            <h1>
              <WordCycle
                prefix='Is it true that'
                words={[
                  'this paper replicates',
                  'an AI found a genuinely new proof',
                  'the Collatz conjecture is true',
                  'this benchmark result holds up',
                  'LK-99 is a superconductor',
                  'P ≠ NP',
                ]}
                suffix='?'
              />
            </h1>
            <p className='hero-intro'>
              Fountain is a market for open questions in science, maths and technology.
            </p>
            <p className='hero-pitch'>
              Stake points on what you believe, make your case with evidence, and earn the most when
              you're right before everyone else.
            </p>
            <div className='hero-actions'>
              <FollowButton />
            </div>
            <p className='hero-note'>
              Fountain is in early development. The ideas behind it are discussed in the open on X.
            </p>
          </div>
        </div>
      </div>
      <div className='page'>
        <HomepageSection>
          <div className='section-heading'>
            <HomepageSectionTitle>
              Bounties for
              <br /> knowledge.
            </HomepageSectionTitle>
            <HeadingShapesOverlay1 />
          </div>
          <div className='section-body stack'>
            <p>
              Some questions are worth paying to answer: open problems, disputed results, papers
              nobody has replicated.
            </p>
            <p>
              On Fountain, anyone can put points behind a claim they want resolved. Those points are
              the bounty.
            </p>
            <p>
              Whoever moves the market to the right answer collects it, and the more surprising the
              answer, the bigger the reward. Confirming what everyone expected earns little.
              Overturning it earns the most.
            </p>
          </div>
        </HomepageSection>
        <HomepageSection>
          <div className='section-heading'>
            <HomepageSectionTitle>
              A public record,
              <br /> with skin in the game.
            </HomepageSectionTitle>
            <HeadingShapesOverlay2 />
          </div>
          <div className='section-body stack'>
            <p>
              Once you've staked on a claim, you only win if others come to agree with you. So you
              publish your best evidence and reasoning, where everyone can check it.
            </p>
            <p>
              Every claim builds a public record of the arguments, who made them, and what they had
              at stake.
            </p>
            <p>The people who move the market towards the right answer earn the points.</p>
          </div>
        </HomepageSection>
        <HomepageSection>
          <div className='section-heading'>
            <HomepageSectionTitle>How it works.</HomepageSectionTitle>
            <HeadingShapesOverlay3 />
          </div>
          <div className='section-body'>
            <ol className='steps'>
              <li>
                Someone publishes a claim with its possible outcomes, and funds it with points. That
                funding is the bounty.
                <div className='pills'>
                  <OutcomePill color='var(--color-green)'>True</OutcomePill>
                  <OutcomePill color='var(--color-red)'>False</OutcomePill>
                </div>
              </li>
              <li>
                Anyone can stake points on an outcome. Prices show the current consensus. Backing an
                unpopular outcome is cheap, and pays the most if it turns out to be right.
              </li>
              <li>
                Stakes stay locked until the claim settles, so the way to win is to convince others.
                Post your evidence and reasoning on the claim.
              </li>
              <li>
                Each claim has a settlement clock. It runs while one outcome is priced above 90%,
                and drains while it isn't. When it reaches 7 days, the claim settles.
              </li>
              <li>
                Each winning share pays one point. Whatever is left of the bounty goes back to the
                people who funded it.
              </li>
              <li>
                The result stays public, along with the evidence and how it was contested, so you
                can make up your own mind.
              </li>
            </ol>
            <p className='section-footnote'>
              <a href={`${GITHUB_URL}/blob/main/MECHANISM.md`} className='section-link'>
                Read the full mechanism on GitHub
              </a>
            </p>
          </div>
        </HomepageSection>
        <HomepageSection>
          <div className='section-heading'>
            <HomepageSectionTitle>What we believe.</HomepageSectionTitle>
            <HeadingShapesOverlay1 />
          </div>
          <div className='section-body stack'>
            <p className='section-lead'>
              Markets that pay people for generating knowledge will become real economic
              infrastructure, for science, maths and AI.
            </p>
            <p>
              Fountain doesn't accept real money. It runs on points, which can't be bought, sold,
              transferred or redeemed. We're building it with an open mechanism, exact accounting,
              and a public record of every trade.
            </p>
            <div>
              Our principles are:
              <ul className='principles'>
                <li>Freedom of speech.</li>
                <li>Respect for open and civil debate.</li>
                <li>A commitment to seeking objective truth, through evidence.</li>
                <li>Honesty about uncertainty: a settled claim is a consensus, not a verdict.</li>
              </ul>
            </div>
          </div>
        </HomepageSection>
        <div className='faq' id='faq'>
          <h2 className='faq-title'>
            Frequently Asked
            <br /> Questions
          </h2>
          <ul className='faq-list'>
            <Item question='Who decides what is true?'>
              <p>
                No one does, including us. A claim settles when the people with something at stake
                have held a strong consensus for long enough. That's a useful signal, not a
                guarantee.
              </p>
              <p>
                That's why the evidence and reasoning stay public, and each result shows how
                contested it was. Read them and make up your own mind.
              </p>
            </Item>
            <Item question='How does a claim settle?'>
              <p>
                Each claim has a settlement clock. The clock runs while one outcome is priced above
                90%, and drains while it isn't. When it reaches 7 days, the claim settles on that
                outcome. If a different outcome rises above 90%, its clock starts from zero.
              </p>
              <p>
                A dip that's quickly corrected only costs a little time, so stalling a claim means
                paying, again and again, to hold the price down.
              </p>
            </Item>
            <Item question='Can a claim stay open forever?'>
              <p>
                Yes. If no outcome stays above 90% long enough to settle, the claim stays open and
                its bounty keeps waiting. An open problem might stay open for years, until someone
                shows up with the evidence to change people's minds.
              </p>
            </Item>
            <Item question='What do I get for being right?'>
              <p>
                Points, and a reputation. Your profit depends on how far you moved the consensus and
                how unexpected the answer was. Backing a long shot that turns out to be right earns
                far more than agreeing with an obvious favourite.
              </p>
              <p>
                Your profile records the claims you got right, the evidence you contributed, and the
                bounties you funded.
              </p>
            </Item>
            <Item question='Why points instead of money?'>
              <p>
                We believe markets that pay people for generating knowledge will become real
                economic infrastructure, for science, maths and AI. Today, most countries' law,
                Australia's included, treats staking money on a claim as gambling. We think that's
                the wrong category, but we follow the law as it stands, so Fountain runs on points.
              </p>
              <p>
                Points have no monetary value, can't be bought, sold or transferred, and there is no
                plan to convert them into money or tokens. What they measure is real: every point is
                accounted exactly, every trade is public, and your score records how often you moved
                the consensus towards what turned out to be right, before everyone else did.
              </p>
            </Item>
            <Item question='Is there a Fountain token?'>
              <p>No. There is no Fountain token.</p>
            </Item>
            <Item question='How is this different from a poll?'>
              <p>
                A poll counts heads. Nobody pays for being wrong, and strong conviction counts the
                same as a shrug. The majority can also simply be wrong.
              </p>
              <p>
                On Fountain, backing an outcome costs points you can lose, so people are careful
                about what they back, and they have a reason to persuade others with real evidence
                instead of noise.
              </p>
            </Item>
            <Item question='How is this different from a prediction market?'>
              <p>
                Prediction markets typically bet on events with a known date and an official source,
                like an election result. Fountain is a self-resolving prediction market, built for
                questions with no trusted authority to rule on them: open problems, disputed
                findings, and contested claims. Here, a consensus that holds over time is what
                settles the claim.
              </p>
              <p>
                That means Fountain can't guarantee every resolution is correct. It's designed as
                infrastructure for collaborative sensemaking, not as an oracle.
              </p>
            </Item>
            <Item question='What kinds of claims can be published?'>
              <p>
                We're focused on science, maths and technology, where evidence can be checked. A
                claim should be decidable based on evidence. For now, we moderate to prevent abuse:
                spam, explicit content and claims about private individuals are removed.
              </p>
            </Item>
            <Item question='What about statements that are true but misleading?'>
              <p>
                Fountain rates claims on the facts, not on intent. Intent is often impossible to
                prove, so claims should be written as statements that evidence can confirm or
                refute.
              </p>
              <p>
                Avoid staking on claims you believe are poorly defined. When creating a claim, word
                it clearly and objectively to encourage the most participation.
              </p>
            </Item>
          </ul>
        </div>
        <div className='closing'>
          <div className='closing-heading'>
            <HomepageSectionTitle>Make your case.</HomepageSectionTitle>
            <HeadingShapesOverlay4 />
          </div>
          <FollowButton />
        </div>
      </div>
      <Footer />
    </div>
  );
}
