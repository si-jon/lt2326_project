import "./styles.scss";
import { Machine, State } from "xstate";
import { useMachine, asEffect } from "@xstate/react";
import { inspect } from "@xstate/inspect";
import { dmMachine } from "./dmMetronome";
import { asrtts } from "./asrtts";
import createSpeechRecognitionPonyfill from 'web-speech-cognitive-services/lib/SpeechServices/SpeechToText'

let dm = dmMachine
const REGION = 'northeurope';

inspect({
    url: "https://statecharts.io/inspect",
    iframe: false
});


const machine = Machine<SDSContext, any, SDSEvent>({
    id: 'root',
    type: 'parallel',
    states: {
        dm: {
            ...dm
        },
        gui: {
            initial: 'micOnly',
            states: {
                micOnly: {
                    on: { SHOW_ALTERNATIVES: 'showAlternatives' },
                },
                showAlternatives: {
                    on: { SELECT: 'micOnly' },
                }
            }
        },
        asrtts: {
            ...asrtts
        }
    }
},
{
    actions: {
        recLogResult: (context: SDSContext) => {
            /* context.recResult = event.recResult; */
            console.log('U>', context.recResult[0]["utterance"], context.recResult[0]["confidence"]);
        },
        logIntent: (context: SDSContext) => {
            /* context.nluData = event.data */
            console.log('<< NLU intent: ' + context.nluData.intent.name)
        }
    },
});

interface Props extends React.HTMLAttributes<HTMLElement> {
    state: State<SDSContext, any, any, any>;
    alternative: any;
}

const ReactiveButton = (props: Props): JSX.Element => {
    var promptText = ((props.state.context.tdmVisualOutputInfo || [{}])
        .find((el: any) => el.attribute === "name") || {}).value;
    var promptImage = ((props.state.context.tdmVisualOutputInfo || [{}])
        .find((el: any) => el.attribute === "image") || {}).value;
    var circleClass = "circle"
    switch (true) {
        case props.state.matches({ asrtts: 'fail' }) || props.state.matches({ dm: 'fail' }):
            break;
        case props.state.matches({ asrtts: { recognizing: 'pause' } }):
            promptText = "Click to continue"
            break;
        case props.state.matches({ asrtts: 'recognizing' }):
            circleClass = "circle-recognizing"
            promptText = promptText || 'Listening...'
            break;
        case props.state.matches({ asrtts: 'speaking' }):
            circleClass = "circle-speaking"
            promptText = promptText || 'Speaking...'
            break;
        case props.state.matches({ dm: 'init' }):
            promptText = "Click to start!"
            circleClass = "circle-click"
            break;
        default:
            promptText = promptText || '\u00A0'
    }
    return (
        <div className="control">
            <figure className="prompt">
                {promptImage &&
                    <img src={promptImage}
                        alt={promptText} />}
            </figure>
            <div className="status">
                <button type="button" className={circleClass}
                    style={{}} {...props}>
                </button>
                <div className="status-text">
                    {promptText}
                </div>
            </div>
        </div>);
}

const FigureButton = (props: Props): JSX.Element => {
    const caption = props.alternative.find((el: any) => el.attribute === "name").value
    const imageSrc = (props.alternative.find((el: any) => el.attribute === "image") || {}).value
    return (
        <figure className="flex" {...props}>
            {imageSrc &&
                <img src={imageSrc} alt={caption} />}
            <figcaption>{caption}</figcaption>
        </figure>
    )
}

function App() {
    const [current, send] = useMachine(machine, {
        devTools: true,
        actions: {
            recStart: asEffect((context) => {
                context.asr.start()
                console.log('Ready to receive a voice input.');
            }),
            recStop: asEffect((context) => {
                context.asr.abort()
                console.log('Recognition stopped.');
            }),
            ttsStart: asEffect((context) => {
                const utterance = new context.ttsUtterance(context.ttsAgenda);
                console.log("S>", context.ttsAgenda)
                utterance.voice = context.voice
                utterance.onend = () => send('END_SPEECH')
                context.tts.speak(utterance)
            }),
            ttsStop: asEffect((context) => {
                /* console.log('TTS STOP...'); */
                context.tts.cancel()
            }),
            ponyfillASR: asEffect((context, _event) => {
                const
                    { SpeechRecognition }
                        = createSpeechRecognitionPonyfill({
                            audioContext: context.audioCtx,
                            credentials: {
                                region: REGION,
                                authorizationToken: context.azureAuthorizationToken,
                            }
                        });
                context.asr = new SpeechRecognition()
                context.asr.lang = process.env.REACT_APP_ASR_LANGUAGE || 'en-US'
                context.asr.continuous = true
                context.asr.interimResults = true
                context.asr.onresult = function(event: any) {
                    var result = event.results[0]
                    if (result.isFinal) {
                        send({
                            type: "ASR_RESULT", value:
                                [{
                                    "utterance": result[0].transcript,
                                    "confidence": result[0].confidence
                                }]
                        })
                    } else {
                        send({ type: "START_SPEECH" });
                    }
                }

            })
        }
    });

    const figureButtons = (current.context.tdmExpectedAlternatives || []).filter((o: any) => o.visual_information)
        .map(
            (o: any, i: any) => (
                <FigureButton state={current}
                    alternative={o.visual_information}
                    key={i}
                    onClick={() => send({ type: 'SELECT', value: o.semantic_expression })} />
            )
        )

    return (
        <div className="App">
            <ReactiveButton state={current} alternative={{}} onClick={() => send('CLICK')} />
            <div className="select-wrapper">
                <div className="select">
                    {figureButtons}
                </div>
            </div>
        </div>
    );
}

export default App;