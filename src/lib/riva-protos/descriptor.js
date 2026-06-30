// GENERATED FILE — do not edit by hand.
// Regenerate with: node scripts/generate-riva-tts-descriptor.mjs
// protobufjs JSON descriptor for the NVIDIA Riva TTS service, parsed
// (keepCase) from the vendored protos in api/_lib/riva-protos/*.proto,
// themselves from https://github.com/nvidia-riva/common (riva/proto/).
// SPDX-FileCopyrightText: Copyright (c) 2022 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: MIT
export default {
	"nested": {
		"nvidia": {
			"nested": {
				"riva": {
					"options": {
						"cc_enable_arenas": true,
						"go_package": "nvidia.com/riva_speech"
					},
					"nested": {
						"RequestId": {
							"fields": {
								"value": {
									"type": "string",
									"id": 1
								}
							}
						},
						"AudioEncoding": {
							"values": {
								"ENCODING_UNSPECIFIED": 0,
								"LINEAR_PCM": 1,
								"FLAC": 2,
								"MULAW": 3,
								"OGGOPUS": 4,
								"ALAW": 20
							}
						},
						"tts": {
							"options": {
								"cc_enable_arenas": true,
								"go_package": "nvidia.com/riva_speech"
							},
							"nested": {
								"RivaSpeechSynthesis": {
									"methods": {
										"Synthesize": {
											"requestType": "SynthesizeSpeechRequest",
											"responseType": "SynthesizeSpeechResponse"
										},
										"SynthesizeOnline": {
											"requestType": "SynthesizeSpeechRequest",
											"requestStream": true,
											"responseType": "SynthesizeSpeechResponse",
											"responseStream": true
										},
										"GetRivaSynthesisConfig": {
											"requestType": "RivaSynthesisConfigRequest",
											"responseType": "RivaSynthesisConfigResponse"
										}
									}
								},
								"RivaSynthesisConfigRequest": {
									"fields": {
										"model_name": {
											"type": "string",
											"id": 1
										}
									}
								},
								"RivaSynthesisConfigResponse": {
									"fields": {
										"model_config": {
											"rule": "repeated",
											"type": "Config",
											"id": 1
										}
									},
									"nested": {
										"Config": {
											"fields": {
												"model_name": {
													"type": "string",
													"id": 1
												},
												"parameters": {
													"keyType": "string",
													"type": "string",
													"id": 2
												}
											}
										}
									}
								},
								"ZeroShotData": {
									"fields": {
										"audio_prompt": {
											"type": "bytes",
											"id": 1
										},
										"sample_rate_hz": {
											"type": "int32",
											"id": 2
										},
										"encoding": {
											"type": "AudioEncoding",
											"id": 3
										},
										"quality": {
											"type": "int32",
											"id": 4
										},
										"transcript": {
											"type": "string",
											"id": 5
										}
									}
								},
								"SynthesizeSpeechRequest": {
									"fields": {
										"text": {
											"type": "string",
											"id": 1
										},
										"language_code": {
											"type": "string",
											"id": 2
										},
										"encoding": {
											"type": "AudioEncoding",
											"id": 3
										},
										"sample_rate_hz": {
											"type": "int32",
											"id": 4
										},
										"voice_name": {
											"type": "string",
											"id": 5
										},
										"zero_shot_data": {
											"type": "ZeroShotData",
											"id": 6
										},
										"custom_dictionary": {
											"type": "string",
											"id": 7
										},
										"custom_configuration": {
											"keyType": "string",
											"type": "string",
											"id": 8
										},
										"id": {
											"type": "RequestId",
											"id": 100
										}
									}
								},
								"SynthesizeSpeechResponseMetadata": {
									"fields": {
										"text": {
											"type": "string",
											"id": 1
										},
										"processed_text": {
											"type": "string",
											"id": 2
										},
										"predicted_durations": {
											"rule": "repeated",
											"type": "float",
											"id": 8
										}
									}
								},
								"SynthesizeSpeechResponse": {
									"fields": {
										"audio": {
											"type": "bytes",
											"id": 1
										},
										"meta": {
											"type": "SynthesizeSpeechResponseMetadata",
											"id": 2
										},
										"id": {
											"type": "RequestId",
											"id": 100
										}
									}
								}
							}
						}
					}
				}
			}
		}
	}
};
